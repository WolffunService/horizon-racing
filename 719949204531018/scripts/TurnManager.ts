/**
 * Manages turn-based gameplay for PvP Archer matches
 */
import * as hz from 'horizon/core';
import { Events, TurnChangedPayload } from './Events';
import { GameState, PlayerGameStatus } from './GameUtils';
import { MatchManager } from './MatchManager';

export class TurnManager extends hz.Component<typeof TurnManager> {
    static propsDefinition = {
        turnDurationSeconds: { type: hz.PropTypes.Number, default: 15 },
    };

    private combatants: hz.Player[] = [];
    private currentTurnIndex = 0;
    private turnTimer: number | null = null;
    
    private static s_instance: TurnManager;
    
    public static getInstance(): TurnManager {
        return TurnManager.s_instance;
    }

    constructor() {
        super();
        if (TurnManager.s_instance === undefined) {
            TurnManager.s_instance = this;
        } else {
            console.error(`There are two ${this.constructor.name} in the world!`);
            return;
        }
    }

    preStart() {
        this.connectLocalBroadcastEvent(Events.onGameStateChanged, (data) => {
            if (data.toState === GameState.PlayingMatch) {
                this.startMatch();
            } else if (data.toState === GameState.CompletedMatch || data.toState === GameState.ReadyForMatch) {
                this.endMatch();
            }
        });

        this.connectLocalBroadcastEvent(Events.onArrowHitPlayer, () => this.nextTurn());
        this.connectLocalBroadcastEvent(Events.onArrowHitEnvironment, () => this.nextTurn());
    }

    private startMatch() {
        this.combatants = MatchManager.getInstance().getPlayersWithStatus(PlayerGameStatus.Playing);
        if (this.combatants.length < 2) return;
        
        this.currentTurnIndex = Math.random() < 0.5 ? 0 : 1; // Randomly select who goes first
        this.startTurn();
    }
    
    private endMatch() {
        if (this.turnTimer) {
            this.async.clearInterval(this.turnTimer);
            this.turnTimer = null;
        }
        this.combatants = [];
    }

    private startTurn() {
        if (this.turnTimer) this.async.clearInterval(this.turnTimer);

        const currentPlayer = this.combatants[this.currentTurnIndex];
        const payload: TurnChangedPayload = {
            currentPlayer: currentPlayer,
            turnTimeLimit: this.props.turnDurationSeconds,
        };
        this.sendNetworkBroadcastEvent(Events.onTurnChanged, payload);

        // Auto-end turn if time runs out
        this.turnTimer = this.async.setTimeout(() => this.nextTurn(), this.props.turnDurationSeconds * 1000);
    }

    private nextTurn() {
        if (this.combatants.length < 2) return;
        this.currentTurnIndex = (this.currentTurnIndex + 1) % 2;
        this.startTurn();
    }
    
    public getCurrentPlayer(): hz.Player | null {
        if (this.combatants.length >= 2) {
            return this.combatants[this.currentTurnIndex];
        }
        return null;
    }
}

hz.Component.register(TurnManager);
