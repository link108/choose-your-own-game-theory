import SwiftUI

struct ScenarioDetailView: View {
    let scenario: Scenario

    @State private var selectedRole: String = ""
    @State private var updates: [ScenarioUpdate] = []
    @State private var starting = false
    @State private var startedPlaythrough: PlaythroughDetail?
    @State private var showIntake = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Text(scenario.premise)
                if !scenario.setting.isEmpty {
                    Text(scenario.setting).foregroundStyle(.secondary)
                }
                if !scenario.goal.isEmpty {
                    Label(scenario.goal, systemImage: "target")
                }
            }

            if scenario.isLiving {
                Section("Situation log") {
                    Text("Explore plausible outcomes from a dated scenario baseline.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    ForEach(updates) { update in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(update.headline).font(.headline)
                            Text(update.createdAt.shortRelative)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(update.summary).font(.subheadline)
                            ForEach(update.sources, id: \.url) { source in
                                if let url = URL(string: source.url) {
                                    Link("\(source.outlet): \(source.title)", destination: url)
                                        .font(.caption)
                                }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }

            Section("Play as") {
                Picker("Role", selection: $selectedRole) {
                    ForEach(scenario.roles, id: \.name) { role in
                        Text(role.name).tag(role.name)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
                if let role = scenario.roles.first(where: { $0.name == selectedRole }),
                   !role.description.isEmpty {
                    Text(role.description).font(.subheadline).foregroundStyle(.secondary)
                }
            }

            if !scenario.contextDisclaimer.isEmpty {
                Section {
                    Text(scenario.contextDisclaimer)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Button {
                    if scenario.contextEnabled {
                        showIntake = true
                    } else {
                        Task { await start(context: nil, summary: "") }
                    }
                } label: {
                    if starting {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Text("Start playing").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(starting || selectedRole.isEmpty)
            }
        }
        .navigationTitle(scenario.title)
        .navigationBarTitleDisplayMode(.inline)
        .alert("Couldn't start", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
        .sheet(isPresented: $showIntake) {
            ContextIntakeView(scenario: scenario, roleName: selectedRole) { context, summary in
                showIntake = false
                Task { await start(context: context, summary: summary) }
            }
        }
        .navigationDestination(item: $startedPlaythrough) { detail in
            PlayView(playthroughId: detail.id, initial: detail)
        }
        .task {
            if selectedRole.isEmpty { selectedRole = scenario.roles.first?.name ?? "" }
            if scenario.isLiving {
                updates = (try? await APIClient.shared.situationLog(scenario.id)) ?? []
            }
        }
    }

    private func start(context: PlayerContext?, summary: String) async {
        starting = true
        defer { starting = false }
        do {
            startedPlaythrough = try await APIClient.shared.startPlaythrough(
                scenarioId: scenario.id, roleName: selectedRole,
                context: context, contextSummary: summary)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension PlaythroughDetail: Hashable {
    static func == (lhs: PlaythroughDetail, rhs: PlaythroughDetail) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
