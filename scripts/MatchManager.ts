/**
 * Manages player states and teleportation for PvP Archer matches
 */
import * as hz from 'horizon/core';
import { GameState, PlayerGameStatus } from 'GameUtils';
import { Events } from "Events";
import { NPCManager } from './NPCManager';

export interface PlayerData {
  player: hz.Player;
  playerGameStatus: PlayerGameStatus;
}

export class MatchManager extends hz.Component<typeof MatchManager> {
  static propsDefinition = {
    lobbySpawnPoint: { type: hz.PropTypes.Entity },
    // Thêm 2 spawn point cho đấu trường
    archerSpawnPoint1: { type: hz.PropTypes.Entity },
    archerSpawnPoint2: { type: hz.PropTypes.Entity },
    // Bot timeout settings
    waitingForPlayerTimeout: { type: hz.PropTypes.Number, default: 10000 }, // 10 giây
  };
  private lastKnownGameState = GameState.ReadyForMatch;
  private playerMap: Map<number, PlayerData> = new Map<number, PlayerData>();
  private waitingForPlayerTimer: number | null = null;
  private static s_instance: MatchManager
  public static getInstance(): MatchManager {
    return MatchManager.s_instance;
  }

  constructor() {
    super();
    if (MatchManager.s_instance === undefined) {
      MatchManager.s_instance = this;
    }
    else {
      console.error(`There are two ${this.constructor.name} in the world!`)
      return;
    }
  }

  subscriptions: Array<hz.EventSubscription> = [];

  start() {
    // Required abstract method implementation
  }

  preStart() {
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (p) => this.handleOnPlayerEnterWorld(p));
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (p) => this.handleOnPlayerExitWorld(p));

    // Thay thế logic trigger cũ bằng một trigger ở sảnh chờ
    this.connectLocalBroadcastEvent(Events.onRegisterPlayerForMatch, (data) => {
      this.handlePlayerRegisterStandby(data.player);
    });

    this.connectLocalBroadcastEvent(Events.onGameStateChanged, (data) => {
      if (data.toState === GameState.PlayingMatch) {
        this.teleportPlayersToArena();
      }
    });
  }

  public getPlayersWithStatus(playerGameStatus: PlayerGameStatus): Array<hz.Player> {
    return Array.from(this.playerMap.values()).filter(value => value.playerGameStatus === playerGameStatus).map(value => value.player);
  }

  private teleportPlayersToArena() {
    const players = this.getPlayersWithStatus(PlayerGameStatus.Standby);
    if (players.length !== 2) {
      console.error("Not enough players to start the match!");
      return;
    }

    const sp1 = this.props.archerSpawnPoint1!.as(hz.SpawnPointGizmo)!;
    const sp2 = this.props.archerSpawnPoint2!.as(hz.SpawnPointGizmo)!;

    sp1.teleportPlayer(players[0]);
    sp2.teleportPlayer(players[1]);

    this.setPlayerStatus(players[0], PlayerGameStatus.Playing);
    this.setPlayerStatus(players[1], PlayerGameStatus.Playing);
  }

  public resetPlayersToLobby() {
    const lobbySP = this.props.lobbySpawnPoint!.as(hz.SpawnPointGizmo)!;
    this.playerMap.forEach(data => {
      lobbySP.teleportPlayer(data.player);
      this.setPlayerStatus(data.player, PlayerGameStatus.Lobby);
    });
  }

  private setPlayerStatus(player: hz.Player, status: PlayerGameStatus) {
    const data = this.playerMap.get(player.id);
    if (data) {
      data.playerGameStatus = status;
    }
  }

  private handleOnPlayerEnterWorld(player: hz.Player) {
    this.playerMap.set(player.id, { player, playerGameStatus: PlayerGameStatus.Lobby });
    this.props.lobbySpawnPoint!.as(hz.SpawnPointGizmo)!.teleportPlayer(player);
  }

  private handleOnPlayerExitWorld(player: hz.Player) {
    const data = this.playerMap.get(player.id);
    if (data && data.playerGameStatus === PlayerGameStatus.Standby) {
      this.sendLocalBroadcastEvent(Events.onPlayerLeftStandby, { player });
      // Hủy bộ đếm giờ nếu người chơi thoát ra
      this.handlePlayerDeregisterStandby(player);
    }
    this.playerMap.delete(player.id);
  }

  private handlePlayerRegisterStandby(player: hz.Player): void {
    // Chỉ xử lý nếu người chơi là người thật
    if (player.id === NPCManager.getInstance()?.getBotPlayer()?.id) return;

    this.setPlayerStatus(player, PlayerGameStatus.Standby);
    this.sendLocalBroadcastEvent(Events.onPlayerJoinedStandby, { player });

    const standbyPlayers = this.getPlayersWithStatus(PlayerGameStatus.Standby).filter(p => p.id !== NPCManager.getInstance()?.getBotPlayer()?.id);

    // Nếu chỉ có 1 người chơi thật trong hàng chờ, bắt đầu đếm giờ
    if (standbyPlayers.length === 1 && !this.waitingForPlayerTimer) {
      console.log(`Player ${player.name.get()} is waiting. Starting bot timer.`);
      this.waitingForPlayerTimer = this.async.setTimeout(() => {
        const stillWaitingPlayers = this.getPlayersWithStatus(PlayerGameStatus.Standby).filter(p => p.id !== NPCManager.getInstance()?.getBotPlayer()?.id);
        // Nếu sau 10 giây vẫn chỉ có 1 người, yêu cầu spawn bot
        if (stillWaitingPlayers.length === 1) {
          console.log("Timer expired. Requesting bot match.");
          this.sendLocalBroadcastEvent(Events.onRequestBotMatch, { player: stillWaitingPlayers[0] });
        }
        this.waitingForPlayerTimer = null;
      }, this.props.waitingForPlayerTimeout);
    }
  }

  private handlePlayerDeregisterStandby(player: hz.Player): void {
    this.setPlayerStatus(player, PlayerGameStatus.Lobby);

    // Nếu người chơi rời hàng chờ, hủy bộ đếm giờ
    if (this.waitingForPlayerTimer) {
      this.async.clearInterval(this.waitingForPlayerTimer);
      this.waitingForPlayerTimer = null;
      console.log("Player left standby, bot timer cancelled.");
    }
  }

}

hz.Component.register(MatchManager);
