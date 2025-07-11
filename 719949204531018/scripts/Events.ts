/**
 * All events used in the PvP Archer world
 */
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
  onRegisterPlayerForMatch: new hz.LocalEvent<{ player: hz.Player }>("onRegisterPlayerForMatch"),
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
