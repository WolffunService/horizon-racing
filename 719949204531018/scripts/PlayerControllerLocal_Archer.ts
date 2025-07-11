/**
 * Client-side controller for archer input handling and bow mechanics
 */
import * as hz from "horizon/core";
import { Events, FireArrowPayload } from "./Events";

export class PlayerControllerLocal_Archer extends hz.Component<typeof PlayerControllerLocal_Archer> {
    static propsDefinition = {
        bowEntity: { type: hz.PropTypes.Entity },
        maxDrawTime: { type: hz.PropTypes.Number, default: 2 }, // seconds
        maxPowerVelocity: { type: hz.PropTypes.Number, default: 50 },
        minPowerVelocity: { type: hz.PropTypes.Number, default: 10 },
    };

    private owner!: hz.Player;
    private isMyTurn = false;
    private isDrawing = false;
    private drawStartTime = 0;
    private triggerInput: hz.PlayerInput | null = null;
    
    preStart() {
        this.owner = this.entity.owner.get();
        if (this.owner === this.world.getServerPlayer()) return;
        
        // Lắng nghe xem có phải lượt của mình không
        this.connectNetworkBroadcastEvent(Events.onTurnChanged, (payload) => {
            this.isMyTurn = (payload.currentPlayer.id === this.owner.id);
            // Update UI to show "Your Turn" or "Opponent's Turn"
            if (this.isMyTurn) {
                this.world.ui.showPopupForPlayer(this.owner, "Your Turn!", 2);
            }
        });

        // Reset when world resets
        this.connectNetworkBroadcastEvent(Events.onResetLocalObjects, () => {
            this.cleanup();
        });

        this.setupInputs();
    }

    start() {
        // Required method implementation
    }

    private setupInputs() {
        // Kết nối với input bắn cung
        this.triggerInput = hz.PlayerControls.connectLocalInput(
            hz.PlayerInputAction.RightTrigger, 
            hz.ButtonIcon.Fire, 
            this
        );
        
        this.triggerInput.registerCallback((action, pressed) => {
            if (!this.isMyTurn) return;

            if (pressed) { 
                // Bắt đầu kéo cung
                this.startDrawing();
            } else { 
                // Thả ra để bắn
                if (this.isDrawing) {
                    this.fireArrow();
                    this.stopDrawing();
                }
            }
        });
    }

    private startDrawing() {
        this.isDrawing = true;
        this.drawStartTime = this.world.getTime();
        
        // Visual feedback for drawing
        this.world.ui.showPopupForPlayer(this.owner, "Drawing bow...", 0.5);
    }

    private stopDrawing() {
        this.isDrawing = false;
    }

    private fireArrow() {
        const drawDuration = Math.min(this.world.getTime() - this.drawStartTime, this.props.maxDrawTime);
        const powerRatio = drawDuration / this.props.maxDrawTime; // 0.0 to 1.0

        const bow = this.props.bowEntity;
        if (!bow) {
            console.error("No bow entity assigned!");
            return;
        }

        const startPosition = bow.position.get();
        const startRotation = bow.rotation.get();
        
        // Calculate arrow direction based on bow rotation
        const forwardVector = hz.Quaternion.mulVec3(startRotation, hz.Vec3.forward);
        
        // Calculate velocity based on draw power
        const velocity = this.props.minPowerVelocity + 
                        (this.props.maxPowerVelocity - this.props.minPowerVelocity) * powerRatio;
        const initialVelocity = forwardVector.mul(velocity);

        const payload: FireArrowPayload = {
            startPosition,
            startRotation,
            initialVelocity,
        };

        // Send fire request to server
        this.sendNetworkBroadcastEvent(Events.fireArrowRequest, payload);
        
        // Visual feedback
        const powerPercent = Math.round(powerRatio * 100);
        this.world.ui.showPopupForPlayer(this.owner, `Shot fired! Power: ${powerPercent}%`, 2);
        
        // Turn ends after firing
        this.isMyTurn = false;
    }

    private cleanup() {
        this.isMyTurn = false;
        this.isDrawing = false;
        this.drawStartTime = 0;
    }

    dispose() {
        this.cleanup();
        if (this.triggerInput) {
            this.triggerInput.dispose();
            this.triggerInput = null;
        }
    }
}

hz.Component.register(PlayerControllerLocal_Archer);
