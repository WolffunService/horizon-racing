Tuyệt vời! Thêm một con bot (NPC) để chơi cùng khi không có người chơi khác là một tính năng cực kỳ giá trị, giúp giữ chân người chơi và làm cho thế giới của bạn luôn sống động. Dưới đây là kế hoạch chi tiết để tích hợp một con bot vào hệ thống game bắn cung của bạn.

Chúng ta sẽ xây dựng dựa trên nền tảng đã có ở các phase trước.

---

### **`Phase_E_NPC_Bot_Integration.md`**

**Mục tiêu:** Tạo một hệ thống tự động sinh ra một NPC bot để thi đấu với người chơi nếu họ phải chờ quá lâu. Bot này sẽ có khả năng bắn tên về phía người chơi và tham gia vào vòng lặp gameplay như một người chơi thực thụ.

---

### Bước 1: Chuẩn bị Môi trường và Asset cho Bot

1.  **Tạo NPC Gizmo trong World Editor**:
    *   Trong **Build Menu -> Gizmos**, tìm và kéo một **NPC Gizmo** vào world của bạn.
    *   Chọn NPC Gizmo, trong bảng **Properties**:
        *   **Character Name**: Đặt một cái tên thú vị cho bot, ví dụ: "Robin Bot".
        *   **Spawn on Start**: **Tắt** (Uncheck). Chúng ta sẽ chỉ spawn bot khi cần.
        *   **Appearance**: Click vào `Edit Avatar` và tùy chỉnh ngoại hình cho con bot của bạn.
    *   Đặt NPC Gizmo này ở một vị trí khuất tầm nhìn, ví dụ dưới mặt đất, vì nó chỉ là một "điểm spawn" chứ không phải là con bot thực tế.

2.  **Cập nhật `Events.ts`**:
    *   Chúng ta cần một sự kiện mới để yêu cầu server spawn bot.
    *   Mở `scripts/Events.ts` và thêm vào trong `export const Events`:
    ```typescript
    // Thêm vào Events.ts
    onRequestBotMatch: new hz.LocalEvent<{ player: hz.Player }>("onRequestBotMatch"), // Khi người chơi yêu cầu chơi với bot
    ```

---

### Bước 2: Tạo `NPCManager.ts` (Server-Side)

Đây là Manager chuyên trách việc spawn, despawn và quản lý vòng đời của NPC.

1.  **Trong World Editor**:
    *   Tạo một Entity trống, đặt tên `NPCManager_Entity`.
    *   Tạo script mới tên là `NPCManager.ts` và gắn nó vào entity này.
    *   Kéo `NPC Gizmo` đã tạo ở Bước 1 vào thuộc tính `npcGizmo` của script `NPCManager`.

2.  **Tạo file `scripts/NPCManager.ts`**:

    ```typescript
    // File: scripts/NPCManager.ts
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
        public static getInstance(): NPCManager { return NPCManager.s_instance; }

        constructor() {
            super();
            if (NPCManager.s_instance) { console.error("Duplicate NPCManager"); }
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
    ```

---

### Bước 3: Cập nhật `MatchManager.ts` để xử lý Bot

Chúng ta cần một cơ chế để kích hoạt việc spawn bot. `MatchManager` là nơi hợp lý nhất để làm việc này.

**Trong `scripts/MatchManager.ts`:**

1.  **Thêm thuộc tính và biến mới**:

    ```typescript
    // Thêm vào propsDefinition
    waitingForPlayerTimeout: { type: hz.PropTypes.Number, default: 10000 }, // 10 giây
    
    // Thêm vào các biến của class
    private waitingForPlayerTimer: number | null = null;
    ```

2.  **Cập nhật logic `handlePlayerRegisterStandby`**:

    ```typescript
    // Trong MatchManager.ts
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
    ```

3.  **Cập nhật logic `handlePlayerDeregisterStandby`**:

    ```typescript
    // Trong MatchManager.ts
    private handlePlayerDeregisterStandby(player: hz.Player): void {
        this.setPlayerStatus(player, PlayerGameStatus.Lobby);

        // Nếu người chơi rời hàng chờ, hủy bộ đếm giờ
        if (this.waitingForPlayerTimer) {
            this.async.clearInterval(this.waitingForPlayerTimer);
            this.waitingForPlayerTimer = null;
            console.log("Player left standby, bot timer cancelled.");
        }
    }
    ```
    
4.  **Cập nhật `handleOnPlayerExitWorld`**:
    Tương tự như `handlePlayerDeregisterStandby`, cần đảm bảo `waitingForPlayerTimer` được hủy khi người chơi thoát game.

---

### Bước 4: Tạo `BotAIController.ts` (Server-Side)

Đây là "bộ não" của con bot, quyết định khi nào và bắn đi đâu. Đây là phần phức tạp và thú vị nhất.

1.  **Trong World Editor**: Gắn script `BotAIController.ts` vào cùng entity với `NPCManager_Entity`.

2.  **Tạo file `scripts/BotAIController.ts`**:

    ```typescript
    // File: scripts/BotAIController.ts
    import * as hz from 'horizon/core';
    import { Events, FireArrowPayload } from './Events';
    
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
    ```

### **Tổng kết và Kiểm tra**
1.  **Vào world một mình**: Đi đến khu vực đăng ký trận đấu.
2.  **Đợi 10 giây**: Sau 10 giây, `MatchManager` sẽ kích hoạt `NPCManager`.
3.  **Bot xuất hiện**: `NPCManager` sẽ spawn bot. Cả bạn và bot sẽ được đưa vào hàng chờ.
4.  **Trận đấu bắt đầu**: `GameManager` sẽ bắt đầu trận đấu, `MatchManager` dịch chuyển cả hai vào đấu trường.
5.  **Chơi với Bot**: `TurnManager` sẽ quản lý lượt chơi. Khi đến lượt bot, `BotAIController` sẽ tính toán và bắn một mũi tên về phía bạn.
6.  **Kết thúc trận đấu**: Trận đấu diễn ra bình thường cho đến khi một trong hai hết máu.
7.  **Reset**: Khi trận đấu kết thúc và reset, `NPCManager` sẽ despawn con bot, sẵn sàng cho một người chơi mới.

Với kế hoạch này, bạn đã có một hệ thống bot hoàn chỉnh, giúp tăng cường trải nghiệm cho những người chơi đơn lẻ. Chúc bạn thành công