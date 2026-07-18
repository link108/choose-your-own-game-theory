import SwiftUI

/// The turn-page loop: narrative + state summary, option cards, the player's own
/// suggested actions, and the epilogue → review handoff when the run ends.
/// Choice submission disables duplicate taps; retrying the same option is safe
/// server-side (idempotent via the LLM cache).
struct PlayView: View {
    let playthroughId: UUID
    var initial: PlaythroughDetail?

    @State private var detail: Loadable<PlaythroughDetail> = .loading
    @State private var turns: [Turn] = []
    @State private var resolving = false
    @State private var suggestion = ""
    @State private var rejection: String?
    @State private var error: String?

    var body: some View {
        LoadableView(state: detail, retry: load) { loaded in
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(turns) { turn in
                            turnView(turn, isCurrent: turn.index == turns.last?.index)
                                .id(turn.index)
                        }
                        if resolving {
                            HStack(spacing: 8) {
                                ProgressView()
                                Text("The world reacts…")
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                        }
                    }
                    .padding()
                }
                .onChange(of: turns.count) {
                    withAnimation { proxy.scrollTo(turns.last?.index, anchor: .top) }
                }
                .navigationTitle(loaded.scenarioTitle)
                .navigationBarTitleDisplayMode(.inline)
            }
        }
        .toolbar {
            ToolbarItem(placement: .secondaryAction) {
                Button("Abandon run", role: .destructive) {
                    Task {
                        _ = try? await APIClient.shared.abandon(playthroughId: playthroughId)
                        await load()
                    }
                }
            }
        }
        .alert("Error", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
        .task { await load() }
    }

    @ViewBuilder
    private func turnView(_ turn: Turn, isCurrent: Bool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(turn.playerView.narrative)
                .textSelection(.enabled)

            if isCurrent, !turn.playerView.visibleStateSummary.isEmpty {
                Label(turn.playerView.visibleStateSummary, systemImage: "eye")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if turn.isFinal {
                epilogueView(turn)
            } else if isCurrent {
                optionsView(turn)
            } else if let chosen = turn.playerView.options.first(
                where: { $0.id == turn.chosenOptionId }) {
                Label(chosen.text, systemImage: "checkmark.circle.fill")
                    .font(.subheadline.italic())
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func optionsView(_ turn: Turn) -> some View {
        VStack(spacing: 8) {
            ForEach(turn.playerView.options) { option in
                Button {
                    Task { await choose(option) }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(option.text)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let reasoning = option.reasoning, !reasoning.isEmpty {
                            Text(reasoning)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(12)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .disabled(resolving)
                .accessibilityHint("Choose this action")
            }

            HStack {
                TextField("Or suggest your own action…", text: $suggestion, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                Button("Add") { Task { await suggest() } }
                    .disabled(resolving || suggestion.trimmingCharacters(
                        in: .whitespacesAndNewlines).count < 3)
            }
            if let rejection {
                Text(rejection).font(.caption).foregroundStyle(.orange)
            }
        }
    }

    @ViewBuilder
    private func epilogueView(_ turn: Turn) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if !turn.playerView.epilogue.isEmpty {
                Text(turn.playerView.epilogue)
                    .italic()
                    .padding(12)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
            }
            NavigationLink("See what was really going on →") {
                ReviewView(playthroughId: playthroughId)
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private func load() async {
        do {
            let loaded: PlaythroughDetail
            if let initial, turns.isEmpty {
                loaded = initial
            } else {
                loaded = try await APIClient.shared.playthrough(playthroughId)
            }
            detail = .loaded(loaded)
            turns = loaded.turns
        } catch {
            if case .loading = detail { detail = .failed(error) }
        }
    }

    private func choose(_ option: ChoiceOption) async {
        guard !resolving else { return }
        resolving = true
        defer { resolving = false }
        rejection = nil
        do {
            let next = try await APIClient.shared.choose(
                playthroughId: playthroughId, optionId: option.id)
            if let last = turns.indices.last {
                turns[last] = Turn(
                    index: turns[last].index, playerView: turns[last].playerView,
                    chosenOptionId: option.id, isFinal: turns[last].isFinal,
                    createdAt: turns[last].createdAt)
            }
            turns.append(next)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func suggest() async {
        resolving = true
        defer { resolving = false }
        rejection = nil
        do {
            let result = try await APIClient.shared.suggestAction(
                playthroughId: playthroughId, text: suggestion)
            if result.accepted {
                suggestion = ""
                if let last = turns.indices.last { turns[last] = result.turn }
            } else {
                rejection = result.reason
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
