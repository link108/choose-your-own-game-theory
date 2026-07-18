import Foundation

struct APIError: Error, LocalizedError {
    let status: Int
    let detail: String

    var errorDescription: String? { detail }
}

/// Typed client for the shared backend. An actor so token state and the single-flight
/// refresh are race-free. Every call attaches the stored credential (account access
/// JWT, else guest token); a 401 triggers one refresh-token rotation and one retry,
/// mirroring `frontend/src/api.ts`.
actor APIClient {
    static let shared = APIClient()

    private let base = AppConfig.apiBaseURL
    private let tokens = TokenStore()
    private var refreshTask: Task<Bool, Never>?

    // MARK: - JSON conventions

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        decoder.dateDecodingStrategy = .custom { d in
            let raw = try d.singleValueContainer().decode(String.self)
            // FastAPI emits fractional seconds; tolerate both, and naive timestamps
            if let date = fractional.date(from: raw) ?? plain.date(from: raw)
                ?? fractional.date(from: raw + "Z") ?? plain.date(from: raw + "Z") {
                return date
            }
            throw DecodingError.dataCorrupted(.init(
                codingPath: d.codingPath, debugDescription: "unrecognized date: \(raw)"))
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    // MARK: - Identity lifecycle

    var isSignedIn: Bool { tokens.get(.access) != nil }

    /// Make sure the app has *some* credential: account tokens if stored, otherwise a
    /// fresh guest bearer token. Call once at launch before anything else.
    func ensureIdentity() async throws {
        guard tokens.get(.access) == nil, tokens.get(.guest) == nil else { return }
        let res: GuestAuthResponse = try await send("POST", "/api/auth/guest")
        tokens.set(.guest, res.token)
    }

    private func adopt(_ auth: AuthResponse) {
        tokens.set(.access, auth.token)
        tokens.set(.refresh, auth.refreshToken)
        // the guest session now belongs to the account; keeping the old guest token
        // around would keep a back door open after sign-out
        tokens.clear(.guest)
    }

    func register(email: String, password: String) async throws -> User {
        struct Body: Encodable { let email, password: String }
        let auth: AuthResponse = try await send(
            "POST", "/api/auth/register", body: Body(email: email, password: password))
        adopt(auth)
        return auth.user
    }

    func login(email: String, password: String) async throws -> User {
        struct Body: Encodable { let email, password: String }
        let auth: AuthResponse = try await send(
            "POST", "/api/auth/login", body: Body(email: email, password: password))
        adopt(auth)
        return auth.user
    }

    func signInWithApple(identityToken: String) async throws -> User {
        struct Body: Encodable { let identityToken: String }
        let auth: AuthResponse = try await send(
            "POST", "/api/auth/apple", body: Body(identityToken: identityToken))
        adopt(auth)
        return auth.user
    }

    func me() async throws -> User {
        try await send("GET", "/api/auth/me")
    }

    /// Revoke server-side, drop local credentials, and become a fresh guest.
    func signOut() async {
        struct Body: Encodable { let refreshToken: String }
        if let refresh = tokens.get(.refresh) {
            _ = try? await sendVoid("POST", "/api/auth/logout", body: Body(refreshToken: refresh))
        }
        tokens.clearAll()
        try? await ensureIdentity()
    }

    func deleteAccount() async throws {
        try await sendVoid("DELETE", "/api/auth/me")
        tokens.clearAll()
        try? await ensureIdentity()
    }

    // MARK: - Catalog + scenarios

    func catalog() async throws -> Catalog {
        try await send("GET", "/api/catalog")
    }

    func myScenarios() async throws -> [Scenario] {
        try await send("GET", "/api/scenarios")
    }

    func scenario(_ id: UUID) async throws -> Scenario {
        try await send("GET", "/api/scenarios/\(id.uuidString.lowercased())")
    }

    func situationLog(_ scenarioId: UUID) async throws -> [ScenarioUpdate] {
        try await send("GET", "/api/scenarios/\(scenarioId.uuidString.lowercased())/updates")
    }

    // MARK: - Play

    func myPlaythroughs() async throws -> [PlaythroughListItem] {
        try await send("GET", "/api/me/playthroughs")
    }

    func playthrough(_ id: UUID) async throws -> PlaythroughDetail {
        try await send("GET", "/api/playthroughs/\(id.uuidString.lowercased())")
    }

    func contextIntake(
        scenarioId: UUID, roleName: String, context: PlayerContext
    ) async throws -> ContextIntakeResult {
        struct Body: Encodable {
            let roleName: String
            let initialContext: String
            let answers: [ContextAnswer]
        }
        return try await send(
            "POST", "/api/scenarios/\(scenarioId.uuidString.lowercased())/context-intake",
            body: Body(
                roleName: roleName,
                initialContext: context.initialContext,
                answers: context.answers))
    }

    func startPlaythrough(
        scenarioId: UUID, roleName: String,
        context: PlayerContext? = nil, contextSummary: String = ""
    ) async throws -> PlaythroughDetail {
        struct Body: Encodable {
            let roleName: String
            let context: PlayerContext?
            let contextSummary: String
        }
        return try await send(
            "POST", "/api/scenarios/\(scenarioId.uuidString.lowercased())/playthroughs",
            body: Body(roleName: roleName, context: context, contextSummary: contextSummary))
    }

    func choose(playthroughId: UUID, optionId: String) async throws -> Turn {
        struct Body: Encodable { let optionId: String }
        return try await send(
            "POST", "/api/playthroughs/\(playthroughId.uuidString.lowercased())/choice",
            body: Body(optionId: optionId))
    }

    func suggestAction(playthroughId: UUID, text: String) async throws -> SuggestActionResult {
        struct Body: Encodable { let text: String }
        return try await send(
            "POST", "/api/playthroughs/\(playthroughId.uuidString.lowercased())/suggest-action",
            body: Body(text: text))
    }

    func regenerate(playthroughId: UUID) async throws -> Turn {
        try await send(
            "POST", "/api/playthroughs/\(playthroughId.uuidString.lowercased())/regenerate")
    }

    func abandon(playthroughId: UUID) async throws -> Playthrough {
        try await send(
            "POST", "/api/playthroughs/\(playthroughId.uuidString.lowercased())/abandon")
    }

    func review(playthroughId: UUID) async throws -> PlaythroughReview {
        try await send("GET", "/api/playthroughs/\(playthroughId.uuidString.lowercased())/review")
    }

    func analyze(playthroughId: UUID) async throws -> PlaythroughAnalysis {
        try await send(
            "POST", "/api/playthroughs/\(playthroughId.uuidString.lowercased())/analysis")
    }

    // MARK: - Transport

    private func send<T: Decodable>(
        _ method: String, _ path: String, body: (some Encodable)? = nil as Never?,
        retried: Bool = false
    ) async throws -> T {
        let data = try await raw(method, path, body: body, retried: retried)
        return try Self.decoder.decode(T.self, from: data)
    }

    private func sendVoid(
        _ method: String, _ path: String, body: (some Encodable)? = nil as Never?
    ) async throws {
        _ = try await raw(method, path, body: body, retried: false)
    }

    private func raw(
        _ method: String, _ path: String, body: (some Encodable)?, retried: Bool
    ) async throws -> Data {
        var request = URLRequest(url: base.appending(path: path))
        request.httpMethod = method
        if let body {
            request.httpBody = try Self.encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token = tokens.get(.access) ?? tokens.get(.guest) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        if status == 401, !retried, tokens.get(.refresh) != nil,
           path != "/api/auth/refresh", path != "/api/auth/logout" {
            if await refreshIfNeeded() {
                return try await raw(method, path, body: body, retried: true)
            }
        }
        guard (200..<300).contains(status) else {
            struct Detail: Decodable { let detail: String? }
            let detail = (try? Self.decoder.decode(Detail.self, from: data))?.detail
            throw APIError(status: status, detail: detail ?? "request failed (\(status))")
        }
        return data
    }

    /// Rotate the refresh token, single-flight: concurrent 401s share one rotation
    /// (the backend treats reuse of a rotated token as theft).
    private func refreshIfNeeded() async -> Bool {
        if let running = refreshTask { return await running.value }
        let task = Task<Bool, Never> { [self] in
            struct Body: Encodable { let refreshToken: String }
            guard let stored = tokens.get(.refresh) else { return false }
            do {
                let auth: AuthResponse = try await send(
                    "POST", "/api/auth/refresh", body: Body(refreshToken: stored), retried: true)
                adopt(auth)
                return true
            } catch {
                // revoked or expired: drop to guest rather than looping
                tokens.clear(.access)
                tokens.clear(.refresh)
                return false
            }
        }
        refreshTask = task
        let ok = await task.value
        refreshTask = nil
        return ok
    }
}
