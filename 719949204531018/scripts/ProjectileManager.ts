/**
 * Manages arrow spawning and projectile physics for the PvP Archer game
 */
import * as hz from 'horizon/core';
import { Events, FireArrowPayload } from './Events';
import { ArrowController } from './ArrowController';

export class ProjectileManager extends hz.Component<typeof ProjectileManager> {
    static propsDefinition = {
        arrowAsset: { type: hz.PropTypes.Asset },
    };

    private static s_instance: ProjectileManager;
    
    public static getInstance(): ProjectileManager {
        return ProjectileManager.s_instance;
    }

    constructor() {
        super();
        if (ProjectileManager.s_instance === undefined) {
            ProjectileManager.s_instance = this;
        } else {
            console.error(`There are two ${this.constructor.name} in the world!`);
            return;
        }
    }

    preStart() {
        this.connectNetworkBroadcastEvent(Events.fireArrowRequest, (payload, sender) => {
            this.spawnArrow(payload, sender);
        });
    }
    
    private async spawnArrow(payload: FireArrowPayload, attacker: hz.Player) {
        if (!this.props.arrowAsset) return;

        try {
            const spawnedEntities = await this.world.spawnAsset(
                this.props.arrowAsset, 
                payload.startPosition, 
                payload.startRotation
            );
            
            if (spawnedEntities.length > 0) {
                const arrowEntity = spawnedEntities[0];
                const physicalArrow = arrowEntity.as(hz.PhysicalEntity)!;
                const arrowController = arrowEntity.getComponents(ArrowController)[0];
                
                if (arrowController) {
                    arrowController.attacker = attacker;
                }
                
                physicalArrow.velocity.set(payload.initialVelocity);
            }
        } catch (e) {
            console.error("Failed to spawn arrow:", e);
        }
    }
}

hz.Component.register(ProjectileManager);
