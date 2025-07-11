OK, chúng ta sẽ đi sâu vào từng chi tiết, từ cấu trúc file, nội dung code, cho đến các bước cần thực hiện trong Editor của Horizon Worlds.

Đây là một kế hoạch refactor chi tiết đến mức "cầm tay chỉ việc".

---

### **KẾ HOẠCH REFACTOR CHI TIẾT: GAME BẮN CUNG PvP TURN-BASED**

#### **PHẦN A: DỌN DẸP VÀ CHUẨN BỊ MÔI TRƯỜNG**

**Bước 1: Sao lưu và Dọn dẹp Dự án**

1.  **Clone World**: Trong Horizon Worlds, **Duplicate (Clone)** World hiện tại của bạn. Đặt tên cho nó là "ArcheryClash_Dev". Việc này đảm bảo bạn luôn có một bản gốc để tham khảo.
2.  **Xóa các Script không cần thiết**:
    *   Trong thư mục `scripts`, xóa các file sau:
        *   `RaceManager.ts`
        *   `MathUtils.ts` (Logic đường cong không cần nữa)
        *   `PlayerRegisterMatchTrigger.ts`
        *   `PlayerVictoryTrigger.ts` (Sẽ thay bằng logic mới)
        *   `ToggleTrailTrigger.ts`
        *   `PlayerBoostPowerUpTrigger.ts`
3.  **Xóa các Entity không cần thiết trong World Editor**:
    *   Mở World của bạn trong Desktop Editor.
    *   Xóa các entity liên quan đến game đua xe: vạch đích, các trigger trên đường đua, các điểm checkpoint (`trackPointsParent`).
    *   Giữ lại các `Manager` entity (như `GameManager`, `MatchManager`) vì chúng ta sẽ tái sử dụng chúng.

**Bước 2: Cập nhật `Events.ts`**

Đây là trung tâm giao tiếp của game. Hãy định nghĩa các "ngôn ngữ" mà các thành phần sẽ dùng để nói chuyện với nhau.

Mở file `scripts/Events.ts` và thay thế hoàn toàn nội dung bằng:

```typescript
// File: scripts/Events.ts
import * as hz from "horizon/core";
import { GameState } from "GameUtils";

// Định nghĩa kiểu dữ liệu cho các sự kiện để đảm bảo tính nhất quán
export type FireArrowPayload = {
  startPosition: hz.Vec3;
  startRotation: hz.Quaternion;
  initialVelocity: hz.Vec3;
};

export type ArrowHitPlayerPayload = {
  attacker: hz.Player;
  victim: hz.Player;
  arrow: hz.Entity;
  hitColliderName: string;
};

export type ArrowHitEnvironmentPayload = {
    arrow: hz.Entity;
};

export type HealthChangedPayload = {
  player: hz.Player;
  currentHealth: number;
  maxHealth: number;
};

export type TurnChangedPayload = {
  currentPlayer: hz.Player;
  turnTimeLimit: number; // Thời gian cho lượt chơi (giây)
};

export const Events = {
  // Game State Events (Giữ nguyên từ project cũ)
  onGameStateChanged: new hz.LocalEvent<{ fromState: GameState; toState: GameState; }>("onGameStateChanged"),
  onResetWorld: new hz.NetworkEvent("onResetWorld"),
  onResetLocalObjects: new hz.NetworkEvent("onResetLocalObjects"),

  // Player & Match Events (Giữ nguyên)
  onPlayerJoinedStandby: new hz.LocalEvent<{ player: hz.Player }>("onPlayerJoinedStandby"),
  onPlayerLeftStandby: new hz.LocalEvent<{ player: hz.Player }>("onPlayerLeftStandby"),

  // Gameplay Events (Mới)
  fireArrowRequest: new hz.NetworkEvent<FireArrowPayload>("fireArrowRequest"), // Client -> Server
  onArrowHitPlayer: new hz.LocalEvent<ArrowHitPlayerPayload>("onArrowHitPlayer"), // Server-side
  onArrowHitEnvironment: new hz.LocalEvent<ArrowHitEnvironmentPayload>("onArrowHitEnvironment"), // Server-side
  onPlayerDefeated: new hz.LocalEvent<{ winner: hz.Player; loser: hz.Player; }>("onPlayerDefeated"), // Server-side

  // Turn Management Events (Mới)
  onTurnChanged: new hz.NetworkEvent<TurnChangedPayload>("onTurnChanged"), // Server -> Client

  // Health & HUD Events (Mới)
  onHealthChanged: new hz.NetworkEvent<HealthChangedPayload>("onHealthChanged"), // Server -> Client
};
```

#### **PHẦN B: CẤU TRÚC LẠI CÁC MANAGER CỐT LÕI (SERVER-SIDE)**

**Bước 3: Chỉnh sửa `GameManager.ts`**

`GameManager` giờ sẽ điều khiển luồng trận đấu bắn cung.

```typescript
// File: scripts/GameManager.ts
import * as hz from 'horizon/core';
import { Events } from "Events";
import { timedIntervalActionFunction, GameState } from 'GameUtils';
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

    // ... (Giữ lại Singleton pattern: s_instance, getInstance, constructor)

    private currentGameState = GameState.ReadyForMatch;
    private gameStateUI: hz.TextGizmo | null = null;
    
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
```

**Bước 4: Chỉnh sửa `MatchManager.ts`**

Manager này giờ sẽ dịch chuyển người chơi vào "đấu trường".

1.  **Trong World Editor**: Tạo 2 `SpawnPointGizmo` và đặt tên chúng là "SpawnPoint_Player1" và "SpawnPoint_Player2". Kéo chúng vào thuộc tính của `MatchManager` script.

2.  **Cập nhật code**:

```typescript
// File: scripts/MatchManager.ts
import * as hz from 'horizon/core';
import { GameState, PlayerGameStatus } from 'GameUtils'; // Bạn sẽ cần thêm PlayerGameStatus vào GameUtils
import { Events } from "Events";

// ... (Giữ lại interface PlayerData và Singleton pattern)

export class MatchManager extends hz.Component<typeof MatchManager> {
    static propsDefinition = {
        lobbySpawnPoint: { type: hz.PropTypes.Entity },
        // Thêm 2 spawn point cho đấu trường
        archerSpawnPoint1: { type: hz.PropTypes.Entity },
        archerSpawnPoint2: { type: hz.PropTypes.Entity },
    };

    private playerMap: Map<number, PlayerData> = new Map<number, PlayerData>();
    
    // ... (Giữ lại Singleton)
    
    preStart() {
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (p) => this.handleOnPlayerEnterWorld(p));
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitWorld, (p) => this.handleOnPlayerExitWorld(p));
        
        // Thay thế logic trigger cũ bằng một trigger ở sảnh chờ
        this.connectLocalBroadcastEvent(Events.onRegisterPlayerForMatch, (data) => {
            this.setPlayerStatus(data.player, PlayerGameStatus.Standby);
            this.sendLocalBroadcastEvent(Events.onPlayerJoinedStandby, { player: data.player });
        });
        
        this.connectLocalBroadcastEvent(Events.onGameStateChanged, (data) => {
            if (data.toState === GameState.PlayingMatch) {
                this.teleportPlayersToArena();
            }
        });
    }

    // ... (Giữ lại getPlayersWithStatus)
    
    private teleportPlayersToArena() {
        const players = this.getPlayersWithStatus(PlayerGameStatus.Standby);
        if (players.length !== 2) {
            console.error("Not enough players to start the match!");
            return;
        }

        const sp1 = this.props.archerSpawnPoint1!.as(hz.SpawnPointGizmo)!;
        const sp2 = this.props.archerSpawnPoint2!.as(hz.SpawnPointGizmo)!;

        sp1.teleportPlayer(players[0]);
        sp2.teleportPlayer(players[1]);
        
        this.setPlayerStatus(players[0], PlayerGameStatus.Playing);
        this.setPlayerStatus(players[1], PlayerGameStatus.Playing);
    }
    
    public resetPlayersToLobby() {
        const lobbySP = this.props.lobbySpawnPoint!.as(hz.SpawnPointGizmo)!;
        this.playerMap.forEach(data => {
            lobbySP.teleportPlayer(data.player);
            this.setPlayerStatus(data.player, PlayerGameStatus.Lobby);
        });
    }
    
    private setPlayerStatus(player: hz.Player, status: PlayerGameStatus) {
        const data = this.playerMap.get(player.id);
        if (data) {
            data.playerGameStatus = status;
        }
    }
    
    // ... (Giữ lại handleOnPlayerEnterWorld và handleOnPlayerExitWorld, nhưng đơn giản hóa chúng)
    private handleOnPlayerEnterWorld(player: hz.Player) {
        this.playerMap.set(player.id, { player, playerGameStatus: PlayerGameStatus.Lobby });
        this.props.lobbySpawnPoint!.as(hz.SpawnPointGizmo)!.teleportPlayer(player);
    }
    
    private handleOnPlayerExitWorld(player: hz.Player) {
        const data = this.playerMap.get(player.id);
        if (data && data.playerGameStatus === PlayerGameStatus.Standby) {
            this.sendLocalBroadcastEvent(Events.onPlayerLeftStandby, { player });
        }
        this.playerMap.delete(player.id);
    }
}
hz.Component.register(MatchManager);
```

#### **PHẦN C: XÂY DỰNG GAMEPLAY CỐT LÕI**

**Bước 5: Tạo Asset Mũi Tên và `ArrowController.ts`**

1.  **Trong World Editor**:
    *   Tạo một vật thể hình mũi tên (ví dụ dùng hình trụ và hình nón).
    *   Group chúng lại.
    *   Trên Group, thiết lập:
        *   **Motion**: `Interactive`
        *   **Interaction**: `Physics`
        *   **Mass**: `0.1` (nhẹ để bay nhanh)
        *   **Gravity**: Bật (để mũi tên bay theo đường vòng cung).
    *   Tạo một script mới tên là `ArrowController.ts`. Gắn script này vào Group mũi tên.
    *   Tạo một **Template Asset** từ Group mũi tên này. Đặt tên là "ArrowAsset".

2.  **Code cho `ArrowController.ts`**:

```typescript
// File: scripts/ArrowController.ts
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
```

**Bước 6: Tạo các Manager cho gameplay mới (Server-side)**

Tạo 3 file mới: `ProjectileManager.ts`, `HealthManager.ts`, và `TurnManager.ts`. Gắn chúng vào các Entity trống trong world.

**`ProjectileManager.ts`**
```typescript
// File: scripts/ProjectileManager.ts
import * as hz from 'horizon/core';
import { Events, FireArrowPayload } from './Events';
import { ArrowController } from './ArrowController';

export class ProjectileManager extends hz.Component<typeof ProjectileManager> {
    static propsDefinition = {
        arrowAsset: { type: hz.PropTypes.Asset },
    };
    // ... (Singleton pattern)

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
```

**`HealthManager.ts`**
```typescript
// File: scripts/HealthManager.ts
import * as hz from 'horizon/core';
import { Events, ArrowHitPlayerPayload, HealthChangedPayload } from './Events';

export class HealthManager extends hz.Component<typeof HealthManager> {
    static propsDefinition = {
        maxHealth: { type: hz.PropTypes.Number, default: 100 },
        knockbackForce: { type: hz.PropTypes.Number, default: 5 },
    };
    
    private playerHealth = new Map<number, number>();
    
    // ... (Singleton pattern)
    
    preStart() {
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (p) => {
            this.playerHealth.set(p.id, this.props.maxHealth);
        });
        
        this.connectLocalBroadcastEvent(Events.onArrowHitPlayer, (payload) => this.handleHit(payload));
    }
    
    private handleHit(payload: ArrowHitPlayerPayload) {
        const victim = payload.victim;
        const currentHealth = this.playerHealth.get(victim.id) ?? this.props.maxHealth;
        
        let damage = 10; // Base damage
        if (payload.hitColliderName === "Head") {
            damage *= 2.5; // Headshot multiplier
        }
        
        const newHealth = Math.max(0, currentHealth - damage);
        this.playerHealth.set(victim.id, newHealth);
        
        // Apply knockback
        const knockbackDir = payload.arrow.as(hz.PhysicalEntity)!.velocity.get().normalize();
        victim.applyForce(knockbackDir.mul(this.props.knockbackForce));
        
        // Notify clients
        const healthUpdatePayload: HealthChangedPayload = {
            player: victim,
            currentHealth: newHealth,
            maxHealth: this.props.maxHealth,
        };
        this.sendNetworkBroadcastEvent(Events.onHealthChanged, healthUpdatePayload);
        
        if (newHealth <= 0) {
            this.sendLocalBroadcastEvent(Events.onPlayerDefeated, {
                winner: payload.attacker,
                loser: victim,
            });
        }
    }
}
hz.Component.register(HealthManager);
```

**`TurnManager.ts`**
```typescript
// File: scripts/TurnManager.ts
import * as hz from 'horizon/core';
import { Events, TurnChangedPayload } from './Events';
import { GameState } from './GameUtils';
import { MatchManager } from './MatchManager';

export class TurnManager extends hz.Component<typeof TurnManager> {
    static propsDefinition = {
        turnDurationSeconds: { type: hz.PropTypes.Number, default: 15 },
    };

    private combatants: hz.Player[] = [];
    private currentTurnIndex = 0;
    private turnTimer: number | null = null;
    
    // ... (Singleton pattern)

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
}
hz.Component.register(TurnManager);
```

#### **PHẦN D: LOGIC PHÍA CLIENT**

**Bước 7: `PlayerControllerLocal_Archer.ts`**

Đây là script phức tạp nhất ở phía client, xử lý input.

```typescript
// File: scripts/PlayerControllerLocal_Archer.ts
import * as hz from "horizon/core";
import { Events, FireArrowPayload } from "./Events";

export class PlayerControllerLocal_Archer extends hz.Component<typeof PlayerControllerLocal_Archer> {
    static propsDefinition = {
        bowEntity: { type: hz.PropTypes.Entity },
        maxDrawTime: { type: hz.PropTypes.Number, default: 2 }, // seconds
        maxPowerVelocity: { type: hz.PropTypes.Number, default: 50 },
    };

    private owner!: hz.Player;
    private isMyTurn = false;
    private isDrawing = false;
    private drawStartTime = 0;
    
    // ... (logic để quản lý pool giống PlayerControllerLocal cũ)

    preStart() {
        this.owner = this.entity.owner.get();
        if (this.owner === this.world.getServerPlayer()) return;
        
        // Lắng nghe xem có phải lượt của mình không
        this.connectNetworkBroadcastEvent(Events.onTurnChanged, (payload) => {
            this.isMyTurn = (payload.currentPlayer.id === this.owner.id);
            // (Optional) Cập nhật HUD để hiển thị "Your Turn" hoặc "Opponent's Turn"
        });

        // Kết nối với input
        const triggerInput = hz.PlayerControls.connectLocalInput(hz.PlayerInputAction.RightTrigger, hz.ButtonIcon.Fire, this);
        triggerInput.registerCallback((action, pressed) => {
            if (!this.isMyTurn) return;

            if (pressed) { // Bắt đầu kéo cung
                this.isDrawing = true;
                this.drawStartTime = this.world.time.get();
            } else { // Thả ra để bắn
                if (this.isDrawing) {
                    this.fireArrow();
                    this.isDrawing = false;
                }
            }
        });
    }

    private fireArrow() {
        const drawDuration = Math.min(this.world.time.get() - this.drawStartTime, this.props.maxDrawTime);
        const powerRatio = drawDuration / this.props.maxDrawTime; // 0.0 to 1.0

        const bow = this.props.bowEntity!;
        const startPosition = bow.position.get();
        const startRotation = bow.rotation.get();
        
        const forwardVector = hz.Quaternion.mulVec3(startRotation, hz.Vec3.forward);
        const initialVelocity = forwardVector.mul(this.props.maxPowerVelocity * powerRatio);

        const payload: FireArrowPayload = {
            startPosition,
            startRotation,
            initialVelocity,
        };

        this.sendNetworkBroadcastEvent(Events.fireArrowRequest, payload);
        this.isMyTurn = false; // Mất lượt sau khi bắn
    }
}
hz.Component.register(PlayerControllerLocal_Archer);
```

**Bước 8: `HUDLocal_Archer.ts`**

Giao diện người dùng cho mỗi người chơi.

```typescript
// File: HUDLocal_Archer.ts
import * as hz from "horizon/core";
import { Events, HealthChangedPayload, TurnChangedPayload } from "./Events";

export class HUDLocal_Archer extends hz.Component<typeof HUDLocal_Archer> {
    static propsDefinition = {
        myHealthBar: { type: hz.PropTypes.Entity },
        opponentHealthBar: { type: hz.PropTypes.Entity },
        turnIndicatorText: { type: hz.PropTypes.Entity },
    };

    private owner!: hz.Player;
    private myHealthBar: hz.MeshEntity | null = null;
    // ...

    preStart() {
        this.owner = this.entity.owner.get();
        if (this.owner === this.world.getServerPlayer()) return;

        this.myHealthBar = this.props.myHealthBar!.as(hz.MeshEntity);
        // ...
        
        this.connectNetworkBroadcastEvent(Events.onHealthChanged, (payload) => {
            const isMe = (payload.player.id === this.owner.id);
            const healthBar = isMe ? this.myHealthBar : this.opponentHealthBar;
            
            const healthRatio = payload.currentHealth / payload.maxHealth;
            // Cập nhật chiều dài hoặc màu sắc của thanh máu
            healthBar?.scale.set(new hz.Vec3(healthRatio, 1, 1));
        });

        this.connectNetworkBroadcastEvent(Events.onTurnChanged, (payload) => {
            const textGizmo = this.props.turnIndicatorText!.as(hz.TextGizmo);
            if (payload.currentPlayer.id === this.owner.id) {
                textGizmo.text.set("YOUR TURN");
            } else {
                textGizmo.text.set("OPPONENT'S TURN");
            }
        });
    }
}
hz.Component.register(HUDLocal_Archer);
```

---
### **TỔNG KẾT VÀ CÁC BƯỚC TIẾP THEO**

1.  **Hoàn thành các bước trên**: Sau khi hoàn thành, bạn sẽ có một bộ khung game PvP turn-based hoạt động.
2.  **Thiết lập trong Editor**:
    *   Tạo các Entity và gắn các script Manager vào.
    *   Thiết lập các thuộc tính (`props`) cho từng script (ví dụ: kéo Asset mũi tên vào `ProjectileManager`, kéo các Spawn Point vào `MatchManager`).
    *   Tạo các trigger ở sảnh chờ để người chơi đăng ký trận đấu.
    *   Tạo UI cho HUD và gán các thành phần vào `HUDLocal_Archer`.
3.  **Kiểm tra và Tinh chỉnh**:
    *   Vào game với 2 người chơi và kiểm tra luồng hoạt động.
    *   Tinh chỉnh các thông số vật lý của mũi tên, lực knockback, sát thương, thời gian mỗi lượt...
4.  **Thêm hiệu ứng**: Tích hợp `EnvironmentalSoundManager` và các hiệu ứng hạt (`ParticleGizmo`) để game sống động hơn.

Kế hoạch này khá dài và chi tiết, nhưng nó sẽ giúp bạn đi đúng hướng và có một sản phẩm hoạt động được. Chúc bạn thành công