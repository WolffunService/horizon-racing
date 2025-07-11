/**
 * Client-side HUD for PvP Archer game showing health bars, turn indicators, and game state
 */
import * as hz from "horizon/core";
import { Events, HealthChangedPayload, TurnChangedPayload } from "./Events";

export class HUDLocal_Archer extends hz.Component<typeof HUDLocal_Archer> {
    static propsDefinition = {
        myHealthBar: { type: hz.PropTypes.Entity },
        opponentHealthBar: { type: hz.PropTypes.Entity },
        turnIndicatorText: { type: hz.PropTypes.Entity },
        myHealthText: { type: hz.PropTypes.Entity },
        opponentHealthText: { type: hz.PropTypes.Entity },
    };

    private owner!: hz.Player;
    private myHealthBar: hz.MeshEntity | null = null;
    private opponentHealthBar: hz.MeshEntity | null = null;
    private turnIndicatorText: hz.TextGizmo | null = null;
    private myHealthText: hz.TextGizmo | null = null;
    private opponentHealthText: hz.TextGizmo | null = null;

    private myCurrentHealth = 100;
    private opponentCurrentHealth = 100;
    private maxHealth = 100;

    preStart() {
        this.owner = this.entity.owner.get();
        if (this.owner === this.world.getServerPlayer()) return;

        // Initialize UI elements
        this.myHealthBar = this.props.myHealthBar?.as(hz.MeshEntity) ?? null;
        this.opponentHealthBar = this.props.opponentHealthBar?.as(hz.MeshEntity) ?? null;
        this.turnIndicatorText = this.props.turnIndicatorText?.as(hz.TextGizmo) ?? null;
        this.myHealthText = this.props.myHealthText?.as(hz.TextGizmo) ?? null;
        this.opponentHealthText = this.props.opponentHealthText?.as(hz.TextGizmo) ?? null;

        // Initialize UI
        this.updateHealthDisplay();
        this.updateTurnIndicator("Waiting for match...");

        // Listen for health changes
        this.connectNetworkBroadcastEvent(Events.onHealthChanged, (payload) => {
            this.handleHealthChanged(payload);
        });

        // Listen for turn changes
        this.connectNetworkBroadcastEvent(Events.onTurnChanged, (payload) => {
            this.handleTurnChanged(payload);
        });

        // Reset when world resets
        this.connectNetworkBroadcastEvent(Events.onResetLocalObjects, () => {
            this.resetHUD();
        });
    }

    start() {
        // Required method implementation
    }

    private handleHealthChanged(payload: HealthChangedPayload) {
        const isMe = (payload.player.id === this.owner.id);
        
        if (isMe) {
            this.myCurrentHealth = payload.currentHealth;
        } else {
            this.opponentCurrentHealth = payload.currentHealth;
        }
        
        this.maxHealth = payload.maxHealth;
        this.updateHealthDisplay();
    }

    private handleTurnChanged(payload: TurnChangedPayload) {
        if (payload.currentPlayer.id === this.owner.id) {
            this.updateTurnIndicator("YOUR TURN");
        } else {
            this.updateTurnIndicator("OPPONENT'S TURN");
        }
    }

    private updateHealthDisplay() {
        // Update health bars (scale them based on health percentage)
        const myHealthRatio = this.myCurrentHealth / this.maxHealth;
        const opponentHealthRatio = this.opponentCurrentHealth / this.maxHealth;

        if (this.myHealthBar) {
            this.myHealthBar.scale.set(new hz.Vec3(myHealthRatio, 1, 1));
        }

        if (this.opponentHealthBar) {
            this.opponentHealthBar.scale.set(new hz.Vec3(opponentHealthRatio, 1, 1));
        }

        // Update health text
        if (this.myHealthText) {
            this.myHealthText.text.set(`You: ${this.myCurrentHealth}/${this.maxHealth}`);
        }

        if (this.opponentHealthText) {
            this.opponentHealthText.text.set(`Opponent: ${this.opponentCurrentHealth}/${this.maxHealth}`);
        }

        // Change color based on health level
        this.updateHealthBarColor(this.myHealthBar, myHealthRatio);
        this.updateHealthBarColor(this.opponentHealthBar, opponentHealthRatio);
    }

    private updateHealthBarColor(healthBar: hz.MeshEntity | null, healthRatio: number) {
        if (!healthBar) return;

        // Green to red gradient based on health
        let color: hz.Vec3;
        if (healthRatio > 0.6) {
            // Green to yellow
            color = new hz.Vec3(1 - healthRatio, 1, 0);
        } else if (healthRatio > 0.3) {
            // Yellow to orange
            color = new hz.Vec3(1, healthRatio * 1.5, 0);
        } else {
            // Orange to red
            color = new hz.Vec3(1, 0, 0);
        }

        healthBar.style.tintColor.set(new hz.Color(color.x, color.y, color.z, 1));
        healthBar.style.tintStrength.set(1);
    }

    private updateTurnIndicator(text: string) {
        if (this.turnIndicatorText) {
            this.turnIndicatorText.text.set(text);
        }
    }

    private resetHUD() {
        this.myCurrentHealth = 100;
        this.opponentCurrentHealth = 100;
        this.maxHealth = 100;
        this.updateHealthDisplay();
        this.updateTurnIndicator("Waiting for match...");
    }
}

hz.Component.register(HUDLocal_Archer);
