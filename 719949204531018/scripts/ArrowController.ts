/**
 * Controls arrow behavior including collision detection and damage calculation
 */
import * as hz from 'horizon/core';
import { Events, ArrowHitPlayerPayload, ArrowHitEnvironmentPayload } from './Events';

export class ArrowController extends hz.Component<typeof ArrowController> {
    static propsDefinition = {
        damage: { type: hz.PropTypes.Number, default: 10 },
        headshotMultiplier: { type: hz.PropTypes.Number, default: 2.5 },
    };

    private collisionSub: hz.EventSubscription | null = null;
    private hasHit = false; // Ngăn va chạm nhiều lần
    public attacker: hz.Player | null = null; // Sẽ được gán bởi ProjectileManager

    preStart() {
        this.collisionSub = this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnEntityCollision, (data) => this.onCollision(data));
    }
    
    private onCollision(data: {
        collidedWith: hz.Entity;
        collisionAt: hz.Vec3;
        normal: hz.Vec3;
        relativeVelocity: hz.Vec3;
        localColliderName: string;
        otherColliderName: string;
    }) {
        if (this.hasHit) return;
        this.hasHit = true;
        this.entity.as(hz.PhysicalEntity)!.locked.set(true); // Dừng mũi tên lại

        // Kiểm tra xem va chạm với người chơi hay không
        // Cần có một cách để lấy Player từ Entity. Một cách đơn giản là dùng tag.
        if (data.collidedWith.tags.get().contains("PlayerCollider")) {
            const victim = data.collidedWith.owner.get(); // Giả định collider của người chơi do chính họ sở hữu
            if (victim && victim.id !== this.attacker?.id) {
                const payload: ArrowHitPlayerPayload = {
                    attacker: this.attacker!,
                    victim: victim,
                    arrow: this.entity,
                    hitColliderName: data.otherColliderName,
                };
                this.sendLocalBroadcastEvent(Events.onArrowHitPlayer, payload);
            }
        } else {
             const payload: ArrowHitEnvironmentPayload = {
                arrow: this.entity,
            };
            this.sendLocalBroadcastEvent(Events.onArrowHitEnvironment, payload);
        }
        
        // Hủy mũi tên sau 3 giây
        this.async.setTimeout(() => this.world.deleteAsset(this.entity), 3000);
    }
}

hz.Component.register(ArrowController);
