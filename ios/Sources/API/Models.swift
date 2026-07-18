import Foundation

// Wire types mirroring the committed openapi.json (snake_case on the wire; the
// decoder/encoder strategies map to camelCase). Replace with generated models once
// swift-openapi-generator is wired up in Xcode.

// MARK: - Auth

struct User: Codable, Identifiable, Hashable {
    let id: UUID
    let email: String
    let emailVerified: Bool
    let role: String
    let createdAt: Date
}

struct AuthResponse: Codable {
    let token: String
    let refreshToken: String
    let user: User
}

struct GuestAuthResponse: Codable {
    let token: String
}

// MARK: - Scenarios

struct RolePlayer: Codable, Hashable {
    var name: String
    var description: String
    var privateInfo: String
}

struct NPC: Codable, Hashable {
    var name: String
    var description: String
    var hiddenAgenda: String
}

struct Scenario: Codable, Identifiable, Hashable {
    let id: UUID
    let title: String
    let category: String
    let premise: String
    let setting: String
    let tone: String
    let goal: String
    let gmNotes: String
    let contextEnabled: Bool
    let contextPrompt: String
    let contextDisclaimer: String
    let riskDomain: String
    let roles: [RolePlayer]
    let npcs: [NPC]
    let isLibrary: Bool
    let isLiving: Bool
    let isPremium: Bool
    let featuredRank: Int?
    let createdAt: Date
    let updatedAt: Date
}

struct CatalogCategory: Codable, Hashable {
    let name: String
    let scenarios: [Scenario]
}

struct Catalog: Codable {
    let featured: [Scenario]
    let live: [Scenario]
    let categories: [CatalogCategory]
}

struct Source: Codable, Hashable {
    let outlet: String
    let lean: String
    let title: String
    let url: String
}

struct ScenarioUpdate: Codable, Identifiable, Hashable {
    let id: UUID
    let headline: String
    let summary: String
    let changes: String
    let sources: [Source]
    let createdAt: Date
}

// MARK: - Play

struct ChoiceOption: Codable, Identifiable, Hashable {
    let id: String
    let text: String
    let reasoning: String?
    let custom: Bool?
}

struct PlayerView: Codable, Hashable {
    let narrative: String
    let visibleStateSummary: String
    let options: [ChoiceOption]
    let epilogue: String
}

struct Turn: Codable, Hashable, Identifiable {
    let index: Int
    let playerView: PlayerView
    let chosenOptionId: String?
    let isFinal: Bool
    let createdAt: Date

    var id: Int { index }
}

struct Playthrough: Codable, Identifiable, Hashable {
    let id: UUID
    let scenarioId: UUID
    let roleName: String
    let status: String
    let createdAt: Date
    let completedAt: Date?
    let turnCount: Int
}

struct PlaythroughListItem: Codable, Identifiable, Hashable {
    let id: UUID
    let scenarioId: UUID
    let scenarioTitle: String
    let roleName: String
    let status: String
    let createdAt: Date
    let completedAt: Date?
    let turnCount: Int
}

struct PlaythroughDetail: Codable, Identifiable {
    let id: UUID
    let scenarioId: UUID
    let scenarioTitle: String
    let roleName: String
    let status: String
    let turns: [Turn]
}

struct SuggestActionResult: Codable {
    let accepted: Bool
    let reason: String
    let turn: Turn
}

// MARK: - Context intake

struct ContextAnswer: Codable, Hashable {
    var question: String
    var answer: String
}

struct PlayerContext: Codable, Hashable {
    var initialContext: String
    var answers: [ContextAnswer]
}

struct ContextIntakeResult: Codable {
    let status: String  // "needs_more" | "ready"
    let questions: [String]
    let summary: String
    let missing: [String]
    let urgentWarning: String
}

// MARK: - Review

struct ActorState: Codable, Hashable {
    let name: String
    let status: String
    let intent: String
    let reasoning: String
}

struct GMState: Codable, Hashable {
    let sceneSummary: String
    let actors: [ActorState]
    let hiddenFacts: [String]
    let goalProgress: String
}

struct ReviewTurn: Codable, Hashable, Identifiable {
    let index: Int
    let playerView: PlayerView
    let gmState: GMState
    let chosenOptionId: String?
    let isFinal: Bool
    let createdAt: Date

    var id: Int { index }
}

struct DecisionAssessment: Codable, Hashable {
    let turnIndex: Int
    let choice: String
    let commentary: String
    let betterAlternative: String
}

struct PlaythroughAnalysis: Codable, Hashable {
    let outcome: String
    let overall: String
    let decisions: [DecisionAssessment]
    let strengths: [String]
    let improvements: [String]
}

struct PlaythroughReview: Codable {
    let id: UUID
    let scenarioId: UUID
    let scenarioTitle: String
    let roleName: String
    let status: String
    let turns: [ReviewTurn]
    let analysis: PlaythroughAnalysis?
}
