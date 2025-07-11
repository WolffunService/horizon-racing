/**
 * AI Controller for bot behavior in PvP Archer matches
 */
import * as hz from 'horizon/core';
import { Events, FireArrowPayload } from './Events';
import { NPCManager } from './NPCManager';

export class BotAIController extends hz.Component<typeof BotAIController> {
    static propsDefinition = {
        // Độ chính xác của bot (0.0 = bắn ngẫu nhiên, 1.0 = bắn hoàn hảo)
        accuracy: { type: hz.PropTypes.Number, default: 0.7 },
        // Thời gian bot suy nghĩ trước khi bắn
        thinkTimeMin: { type: hz.PropTypes.Number, default: 1.0 }, // giây
        thinkTimeMax: { type: hz.PropTypes.Number, default: 3.0 }, // giây
    };
    
    private botPlayer: hz.Player | null = null;
    private humanOpponent: hz.Player | null = null;

    preStart() {
        this.connectLocalBroadcastEvent(Events.onTurnChanged, (payload) => {
            this.botPlayer = NPCManager.getInstance().getBotPlayer();
            if (this.botPlayer && payload.currentPlayer.id === this.botPlayer.id) {
                // Tìm đối thủ là người
                const allPlayers = this.world.getPlayers();
                this.humanOpponent = allPlayers.find(p => p.id !== this.botPlayer!.id) || null;
                
                if (this.humanOpponent) {
                    this.executeBotTurn();
                }
            }
        });
    }

    start() {
        // Required method implementation
    }
    
    private executeBotTurn() {
        if (!this.botPlayer || !this.humanOpponent) return;

        // Bot "suy nghĩ" một lúc
        const thinkTime = Math.random() * (this.props.thinkTimeMax - this.props.thinkTimeMin) + this.props.thinkTimeMin;
        
        this.async.setTimeout(() => {
            this.aimAndFire();
        }, thinkTime * 1000);
    }

    private aimAndFire() {
        if (!this.botPlayer || !this.humanOpponent) return;

        const botPosition = this.botPlayer.head.position.get();
        let targetPosition = this.humanOpponent.head.position.get(); // Mặc định nhắm vào đầu

        // Yếu tố không chính xác
        const inaccuracyOffset = (1 - this.props.accuracy) * 5; // Độ lệch tối đa 5 mét
        const randomOffset = new hz.Vec3(
            (Math.random() - 0.5) * inaccuracyOffset,
            (Math.random() - 0.5) * inaccuracyOffset,
            (Math.random() - 0.5) * inaccuracyOffset
        );
        targetPosition = targetPosition.add(randomOffset);

        // Tính toán hướng bắn và vận tốc (logic đơn giản hóa)
        const direction = targetPosition.sub(botPosition).normalize();
        const distance = targetPosition.distance(botPosition);
        
        // Logic bắn đơn giản: lực bắn tỉ lệ với khoảng cách
        const powerRatio = hz.clamp(distance / 50, 0.3, 1.0); // Bắn ít nhất 30% lực
        const initialVelocity = direction.mul(50 * powerRatio); // 50 là vận tốc tối đa
        
        const startRotation = hz.Quaternion.lookRotation(direction);
        
        const payload: FireArrowPayload = {
            startPosition: botPosition,
            startRotation: startRotation,
            initialVelocity: initialVelocity,
        };

        console.log(`Bot is firing at ${this.humanOpponent.name.get()} with power ${powerRatio.toFixed(2)}`);
        // Bot không cần gửi NetworkEvent, nó có thể trực tiếp gọi logic spawn
        // nhưng để nhất quán, chúng ta vẫn gửi event để ProjectileManager xử lý
        this.sendNetworkBroadcastEvent(Events.fireArrowRequest, payload, this.botPlayer);
    }
}

hz.Component.register(BotAIController);
