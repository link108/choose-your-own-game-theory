import Foundation
import Observation

/// App-wide session state. The backend's identity model means there is always *someone*
/// signed in — a guest bearer session at minimum — so screens never need a logged-out
/// special case, only an "upgrade to account" affordance.
@Observable @MainActor
final class SessionStore {
    enum State {
        case loading
        case guest
        case signedIn(User)
    }

    var state: State = .loading

    var user: User? {
        if case .signedIn(let user) = state { return user }
        return nil
    }

    func bootstrap() async {
        do {
            try await APIClient.shared.ensureIdentity()
            if await APIClient.shared.isSignedIn {
                state = .signedIn(try await APIClient.shared.me())
            } else {
                state = .guest
            }
        } catch {
            // offline or backend down: stay guest; screens surface their own errors
            state = .guest
        }
    }

    func register(email: String, password: String) async throws {
        state = .signedIn(try await APIClient.shared.register(email: email, password: password))
    }

    func login(email: String, password: String) async throws {
        state = .signedIn(try await APIClient.shared.login(email: email, password: password))
    }

    func signInWithApple(identityToken: String) async throws {
        state = .signedIn(
            try await APIClient.shared.signInWithApple(identityToken: identityToken))
    }

    func signOut() async {
        await APIClient.shared.signOut()
        state = .guest
    }

    func deleteAccount() async throws {
        try await APIClient.shared.deleteAccount()
        state = .guest
    }
}
