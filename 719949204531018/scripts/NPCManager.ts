/**
 * Manages NPC bot spawning, despawning, and lifecycle for PvP Archer matches
 */
import * as hz from 'horizon/core';
import { AvatarAIAgent, AgentSpawnResult } from 'horizon/avatar_ai_agent';
import { Events } from './Events';

export class NPCManager extends hz.Component<typeof NPCManager> {
    static propsDefinition = {
        npcGizmo: { type: hz.PropTypes.Entity },
    };

    private npcAgentGizmo: hz.AIAgentGizmo | null = null;
    private npcPlayer: hz.Player | null = null;
    public isBotActive = false;

    private static s_instance: NPCManager;
    public static getInstance(): NPCManager { 
        return NPCManager.s_instance; 
    }

    constructor() {
        super();
        if (NPCManager.s_instance) { 
            console.error("Duplicate NPCManager"); 
        }
        NPCManager.s_instance = this;
    }

    preStart() {
        this.npcAgentGizmo = this.props.npcGizmo!.as(hz.AIAgentGizmo);

        // Lắng nghe yêu cầu spawn bot
        this.connectLocalBroadcastEvent(Events.onRequestBotMatch, async (data) => {
            if (!this.isBotActive) {
                await this.spawnBot(data.player);
            }
        });

        // Lắng nghe khi người chơi thực thoát ra để despawn bot
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (player) => {
            // Nếu người chơi thoát ra không phải là bot, và bot đang active, thì despawn bot
            if (this.isBotActive && this.npcPlayer && player.id !== this.npcPlayer.id) {
                this.despawnBot();
            }
        });
        
        // Lắng nghe sự kiện reset game để despawn bot
        this.connectNetworkBroadcastEvent(Events.onResetWorld, () => {
            if (this.isBotActive) {
                this.despawnBot();
            }
        });
    }

    start() {
        // Required method implementation
    }

    public getBotPlayer(): hz.Player | null {
        return this.npcPlayer;
    }

    async spawnBot(humanPlayer: hz.Player) {
        if (this.isBotActive || !this.npcAgentGizmo) return;
        
        console.log("Spawning bot to play with: " + humanPlayer.name.get());
        const result = await this.npcAgentGizmo.spawnAgentPlayer();

        if (result === AgentSpawnResult.Success) {
            // Đợi một chút để agent sẵn sàng
            this.async.setTimeout(() => {
                const botPlayer = AvatarAIAgent.getGizmoFromPlayer(this.props.npcGizmo!)?.agentPlayer.get();
                if (botPlayer) {
                    this.npcPlayer = botPlayer;
                    this.isBotActive = true;
                    console.log("Bot spawned successfully: " + botPlayer.name.get());
                    // Sau khi bot spawn, đưa cả bot và người chơi vào hàng chờ
                    this.sendLocalBroadcastEvent(Events.onRegisterPlayerForMatch, { player: humanPlayer });
                    this.sendLocalBroadcastEvent(Events.onRegisterPlayerForMatch, { player: this.npcPlayer });
                }
            }, 500);
        } else {
            console.error("Failed to spawn bot. Reason: " + AgentSpawnResult[result]);
        }
    }

    despawnBot() {
        if (!this.isBotActive || !this.props.npcGizmo) return;

        console.log("Despawning bot.");
        const agent = this.props.npcGizmo.as(AvatarAIAgent);
        agent.despawnAgentPlayer();
        this.isBotActive = false;
        this.npcPlayer = null;
    }
}

hz.Component.register(NPCManager);
