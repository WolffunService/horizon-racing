/**
 * Controls the overall game state of the PvP Archer world, managing match flow and transitions
 */
import * as hz from 'horizon/core';
import { Events } from "Events";
import { timedIntervalActionFunction, GameState, PlayerGameStatus } from 'GameUtils';
import { MatchManager } from 'MatchManager';

export class GameManager extends hz.Component<typeof GameManager> {

  static propsDefinition = {
    // UI để hiển thị trạng thái game, có thể đặt ở sảnh chờ
    gameStateUI: { type: hz.PropTypes.Entity },
    // Thời gian đếm ngược
    timeToMatchStartMS: { type: hz.PropTypes.Number, default: 5000 },
    timeToAnnounceWinnerMS: { type: hz.PropTypes.Number, default: 5000 },
    timeToResetMS: { type: hz.PropTypes.Number, default: 5000 },
  };

  private currentGameState = GameState.ReadyForMatch;
  private gameStateUI: hz.TextGizmo | null = null;

  static s_instance: GameManager

  public static getInstance(): GameManager {
    return GameManager.s_instance;
  }

  constructor() {
    super();
    if (GameManager.s_instance === undefined) {
      GameManager.s_instance = this;
    }
    else {
      console.error(`There are two ${this.constructor.name} in the world!`)
      return;
    }
  }

  start() {
    // Required abstract method implementation
  }

  preStart() {
    this.gameStateUI = this.props.gameStateUI?.as(hz.TextGizmo) ?? null;
    this.updateGameStateUI("Waiting for players...");

    // Bắt đầu trận đấu khi có đủ 2 người chơi sẵn sàng
    this.connectLocalBroadcastEvent(Events.onPlayerJoinedStandby, (data) => {
      const standbyPlayers = MatchManager.getInstance().getPlayersWithStatus(PlayerGameStatus.Standby);
      if (standbyPlayers.length === 2 && this.currentGameState === GameState.ReadyForMatch) {
        this.transitFromReadyToStarting();
      }
    });

    // Hủy trận đấu nếu một người thoát ra khi đang chờ
    this.connectLocalBroadcastEvent(Events.onPlayerLeftStandby, (data) => {
      if (this.currentGameState === GameState.StartingMatch) {
        this.transitToReady("A player left. Match cancelled.");
      }
    });

    // Lắng nghe sự kiện người chơi bị đánh bại
    this.connectLocalBroadcastEvent(Events.onPlayerDefeated, (data) => {
      if (this.currentGameState === GameState.PlayingMatch) {
        this.transitFromPlayingToCompleted(data.winner);
      }
    });

    this.connectNetworkBroadcastEvent(Events.onResetWorld, () => this.reset());
  }

  private transitGameState(toState: GameState) {
    const fromState = this.currentGameState;
    if (fromState === toState) return;

    console.log(`Game State Changed: ${GameState[fromState]} -> ${GameState[toState]}`);
    this.currentGameState = toState;
    this.sendLocalBroadcastEvent(Events.onGameStateChanged, { fromState, toState });
  }

  private transitFromReadyToStarting() {
    this.transitGameState(GameState.StartingMatch);
    timedIntervalActionFunction(this.props.timeToMatchStartMS, this,
      (timeLeft) => {
        const text = `Match starts in ${timeLeft / 1000}...`;
        this.updateGameStateUI(text);
        this.world.ui.showPopupForEveryone(text, 1);
      },
      () => { this.transitGameState(GameState.PlayingMatch); }
    );
  }

  private transitFromPlayingToCompleted(winner: hz.Player) {
    this.transitGameState(GameState.CompletedMatch);
    const text = `${winner.name.get()} is victorious!`;
    this.updateGameStateUI(text);
    this.world.ui.showPopupForEveryone(text, this.props.timeToAnnounceWinnerMS / 1000);

    this.async.setTimeout(() => this.transitToReady("New match starting soon..."), this.props.timeToAnnounceWinnerMS);
  }

  private transitToReady(message: string) {
    this.transitGameState(GameState.ReadyForMatch);
    this.updateGameStateUI(message);

    // Reset toàn bộ logic game
    this.world.getPlayers().forEach(player => {
      this.sendNetworkEvent(player, Events.onResetLocalObjects, {});
    });
    MatchManager.getInstance().resetPlayersToLobby();
  }

  private updateGameStateUI(text: string) {
    this.gameStateUI?.text.set(text);
  }

  private reset() {
    this.currentGameState = GameState.ReadyForMatch;
    this.updateGameStateUI("Waiting for players...");
  }
}

hz.Component.register(GameManager);
