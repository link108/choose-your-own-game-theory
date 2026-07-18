import AuthenticationServices
import SwiftUI

struct AccountView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        List {
            switch session.state {
            case .loading:
                ProgressView()
            case .guest:
                GuestSection()
            case .signedIn(let user):
                SignedInSection(user: user)
            }
        }
        .navigationTitle("Account")
    }
}

private struct GuestSection: View {
    @Environment(SessionStore.self) private var session
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    enum Mode: String, CaseIterable {
        case signIn = "Sign in"
        case register = "Create account"
    }

    var body: some View {
        Section {
            Text("You're playing as a guest. Create an account to keep your scenarios "
                + "and runs across devices — everything you've made comes with you.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        Section {
            Picker("Mode", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            SecureField("Password (8+ characters)", text: $password)
                .textContentType(mode == .register ? .newPassword : .password)
            Button {
                Task { await submit() }
            } label: {
                if busy {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text(mode.rawValue).frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || email.isEmpty || password.count < 8)
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
        }
        Section {
            SignInWithAppleButton(.signIn) { request in
                request.requestedScopes = [.email]
            } onCompletion: { result in
                Task { await handleApple(result) }
            }
            .frame(height: 44)
            .listRowBackground(Color.clear)
        }
    }

    private func submit() async {
        busy = true
        defer { busy = false }
        error = nil
        do {
            switch mode {
            case .signIn: try await session.login(email: email, password: password)
            case .register: try await session.register(email: email, password: password)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) async {
        guard case .success(let authorization) = result,
              let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8)
        else { return }
        do {
            try await session.signInWithApple(identityToken: token)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct SignedInSection: View {
    let user: User
    @Environment(SessionStore.self) private var session
    @State private var confirmingDelete = false
    @State private var error: String?

    var body: some View {
        Section("Signed in") {
            LabeledContent("Email", value: user.email)
            if !user.emailVerified {
                Label("Email not yet verified — check your inbox", systemImage: "envelope.badge")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
            LabeledContent("Member since", value: user.createdAt.formatted(date: .abbreviated,
                                                                           time: .omitted))
        }
        Section("Subscription") {
            // M3: StoreKit paywall, manage, restore
            LabeledContent("Plan", value: "Free")
        }
        Section {
            Button("Sign out") {
                Task { await session.signOut() }
            }
            Button("Delete account…", role: .destructive) {
                confirmingDelete = true
            }
            .confirmationDialog(
                "Delete your account? Every scenario, run, and setting is permanently "
                    + "erased. This cannot be undone.",
                isPresented: $confirmingDelete, titleVisibility: .visible
            ) {
                Button("Delete everything", role: .destructive) {
                    Task {
                        do { try await session.deleteAccount() } catch {
                            self.error = error.localizedDescription
                        }
                    }
                }
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
        }
    }
}
