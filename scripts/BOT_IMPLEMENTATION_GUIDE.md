# 🤖 Bot Implementation Guide - PvP Archer Game

## 📋 Overview
This guide explains how to set up and configure the Bot system for your PvP Archer game. The bot system automatically spawns an AI opponent when a player waits too long for a human opponent.

## 🏗️ Components Implemented

### 1. **Events.ts** - Updated
- Added `onRequestBotMatch` event for bot spawning requests

### 2. **NPCManager.ts** - New Component
- Manages bot lifecycle (spawn/despawn)
- Uses Horizon's AvatarAIAgent system
- Singleton pattern for global access

### 3. **MatchManager.ts** - Updated
- Added bot timeout logic (default: 10 seconds)
- Automatically requests bot when player waits alone
- Handles bot cleanup when players leave

### 4. **BotAIController.ts** - New Component
- AI brain for bot behavior
- Configurable accuracy and thinking time
- Handles aiming and shooting logic

### 5. **TurnManager.ts** - Compatible
- Already works with bot players
- No changes needed

## 🛠️ Setup Instructions

### Step 1: Create NPC Gizmo in World Editor
1. Open **Build Menu → Gizmos**
2. Find and drag **NPC Gizmo** into your world
3. Select the NPC Gizmo and configure:
   - **Character Name**: "Robin Bot" (or any name you prefer)
   - **Spawn on Start**: **UNCHECK** (we spawn manually)
   - **Appearance**: Click `Edit Avatar` to customize bot appearance
4. Position the NPC Gizmo somewhere hidden (e.g., underground)

### Step 2: Create NPCManager Entity
1. Create an empty Entity in your world
2. Name it `NPCManager_Entity`
3. Attach the `NPCManager.ts` script to this entity
4. In the script properties:
   - Drag your **NPC Gizmo** into the `npcGizmo` field

### Step 3: Create BotAIController Entity
1. Create another empty Entity (or use the same NPCManager_Entity)
2. Attach the `BotAIController.ts` script
3. Configure AI properties:
   - **Accuracy**: 0.7 (70% accuracy, adjust as needed)
   - **Think Time Min**: 1.0 seconds
   - **Think Time Max**: 3.0 seconds

### Step 4: Update MatchManager Entity
1. Find your existing MatchManager entity
2. The script should automatically have the new `waitingForPlayerTimeout` property
3. Configure timeout (default: 10000ms = 10 seconds)

## ⚙️ Configuration Options

### NPCManager Properties
- `npcGizmo`: Reference to the NPC Gizmo entity

### BotAIController Properties
- `accuracy`: Bot shooting accuracy (0.0 = random, 1.0 = perfect)
- `thinkTimeMin`: Minimum time bot thinks before shooting
- `thinkTimeMax`: Maximum time bot thinks before shooting

### MatchManager Properties
- `waitingForPlayerTimeout`: Time to wait before spawning bot (milliseconds)

## 🎮 How It Works

### Bot Spawning Flow
1. Player enters standby queue alone
2. MatchManager starts 10-second timer
3. If still alone after timeout, requests bot spawn
4. NPCManager spawns bot and adds both players to queue
5. GameManager starts match with human vs bot

### Bot AI Behavior
1. Bot listens for turn changes
2. When it's bot's turn, AI calculates target
3. Applies inaccuracy based on accuracy setting
4. "Thinks" for random time within configured range
5. Fires arrow at calculated target

### Bot Cleanup
- Bot is automatically despawned when:
  - Human player leaves the world
  - Game resets
  - Match ends and new players join

## 🧪 Testing Checklist

### Basic Functionality
- [ ] Bot spawns after 10 seconds of waiting alone
- [ ] Bot appears in the arena when match starts
- [ ] Bot takes turns properly
- [ ] Bot fires arrows during its turn
- [ ] Bot is cleaned up when player leaves

### AI Behavior
- [ ] Bot aims at human player
- [ ] Bot accuracy matches configured setting
- [ ] Bot thinking time varies within range
- [ ] Bot arrows cause damage and trigger turn changes

### Edge Cases
- [ ] Multiple players joining cancels bot spawn
- [ ] Player leaving during bot timer cancels spawn
- [ ] Bot cleanup works on world reset
- [ ] Bot doesn't interfere with human vs human matches

## 🐛 Troubleshooting

### Bot Doesn't Spawn
- Check NPC Gizmo is properly configured
- Verify NPCManager entity has correct script and gizmo reference
- Check console for spawn errors

### Bot Doesn't Shoot
- Ensure BotAIController is attached to an entity
- Check if bot is receiving turn change events
- Verify ProjectileManager is working

### Bot Cleanup Issues
- Check NPCManager event listeners are connected
- Verify bot despawn logic in NPCManager

## 📈 Future Enhancements

### Difficulty Levels
- Create multiple bot configurations with different accuracy
- Add adaptive difficulty based on player performance

### Advanced AI
- Implement predictive aiming for moving targets
- Add strategic target selection (head vs body)
- Include environmental awareness

### Bot Personalities
- Different bot names and appearances
- Varied behavior patterns and strategies
- Chat messages or reactions

---

**Note**: This implementation provides a solid foundation for bot gameplay. The AI is intentionally simple but effective, and can be enhanced based on your specific game requirements.
