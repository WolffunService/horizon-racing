/**
 * Manages player health, damage calculation, and knockback effects
 */
import * as hz from 'horizon/core';
import { Events, ArrowHitPlayerPayload, HealthChangedPayload } from './Events';

export class HealthManager extends hz.Component<typeof HealthManager> {
    static propsDefinition = {
        maxHealth: { type: hz.PropTypes.Number, default: 100 },
        knockbackForce: { type: hz.PropTypes.Number, default: 5 },
        baseDamage: { type: hz.PropTypes.Number, default: 10 },
        headshotMultiplier: { type: hz.PropTypes.Number, default: 2.5 },
        bodyMultiplier: { type: hz.PropTypes.Number, default: 1.0 },
        limbMultiplier: { type: hz.PropTypes.Number, default: 0.8 },
    };
    
    private playerHealth = new Map<number, number>();
    
    private static s_instance: HealthManager;
    
    public static getInstance(): HealthManager {
        return HealthManager.s_instance;
    }

    constructor() {
        super();
        if (HealthManager.s_instance === undefined) {
            HealthManager.s_instance = this;
        } else {
            console.error(`There are two ${this.constructor.name} in the world!`);
            return;
        }
    }
    
    preStart() {
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (p) => {
            this.playerHealth.set(p.id, this.props.maxHealth);
        });

        this.connectLocalBroadcastEvent(Events.onArrowHitPlayer, (payload) => this.handleHit(payload));
    }

    start() {
        // Required method implementation
    }
    
    private handleHit(payload: ArrowHitPlayerPayload) {
        const victim = payload.victim;
        const currentHealth = this.playerHealth.get(victim.id) ?? this.props.maxHealth;
        
        // Calculate damage based on hit location
        let damage = this.props.baseDamage;
        const hitLocation = payload.hitColliderName.toLowerCase();
        
        if (hitLocation.includes("head")) {
            damage *= this.props.headshotMultiplier;
        } else if (hitLocation.includes("body") || hitLocation.includes("chest") || hitLocation.includes("torso")) {
            damage *= this.props.bodyMultiplier;
        } else {
            damage *= this.props.limbMultiplier; // Arms, legs, etc.
        }
        
        const newHealth = Math.max(0, currentHealth - damage);
        this.playerHealth.set(victim.id, newHealth);
        
        // Apply knockback physics
        const arrowVelocity = payload.arrow.as(hz.PhysicalEntity)?.velocity.get();
        if (arrowVelocity) {
            const knockbackDir = arrowVelocity.normalize();
            victim.applyForce(knockbackDir.mul(this.props.knockbackForce));
        }
        
        // Notify clients about health change
        const healthUpdatePayload: HealthChangedPayload = {
            player: victim,
            currentHealth: newHealth,
            maxHealth: this.props.maxHealth,
        };
        this.sendNetworkBroadcastEvent(Events.onHealthChanged, healthUpdatePayload);
        
        // Check if player is defeated
        if (newHealth <= 0) {
            this.sendLocalBroadcastEvent(Events.onPlayerDefeated, {
                winner: payload.attacker,
                loser: victim,
            });
        }
    }
    
    public getPlayerHealth(player: hz.Player): number {
        return this.playerHealth.get(player.id) ?? this.props.maxHealth;
    }
    
    public resetPlayerHealth(player: hz.Player) {
        this.playerHealth.set(player.id, this.props.maxHealth);
    }
}

hz.Component.register(HealthManager);
