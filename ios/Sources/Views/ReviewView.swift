import SwiftUI

/// The post-game reveal: hidden GM state per turn (agendas, private reasoning) and the
/// on-demand coaching analysis — the product's signature moment.
struct ReviewView: View {
    let playthroughId: UUID

    @State private var review: Loadable<PlaythroughReview> = .loading
    @State private var analysis: PlaythroughAnalysis?
    @State private var analyzing = false

    var body: some View {
        LoadableView(state: review, retry: load) { review in
            List {
                Section {
                    if let analysis {
                        analysisView(analysis)
                    } else {
                        Button {
                            Task { await analyze() }
                        } label: {
                            if analyzing {
                                ProgressView().frame(maxWidth: .infinity)
                            } else {
                                Label("Generate coaching analysis", systemImage: "sparkles")
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .disabled(analyzing)
                    }
                }

                ForEach(review.turns) { turn in
                    Section("Turn \(turn.index + 1)") {
                        Text(turn.playerView.narrative)
                            .font(.subheadline)
                            .lineLimit(4)
                        if let chosen = turn.playerView.options.first(
                            where: { $0.id == turn.chosenOptionId }) {
                            Label(chosen.text, systemImage: "checkmark.circle.fill")
                                .font(.subheadline)
                        }
                        DisclosureGroup("Hidden state") {
                            Text(turn.gmState.sceneSummary)
                                .font(.caption)
                            ForEach(turn.gmState.actors, id: \.name) { actor in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(actor.name).font(.caption.bold())
                                    if !actor.intent.isEmpty {
                                        Text("Intent: \(actor.intent)").font(.caption)
                                    }
                                    if !actor.reasoning.isEmpty {
                                        Text(actor.reasoning)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            ForEach(turn.gmState.hiddenFacts, id: \.self) { fact in
                                Label(fact, systemImage: "eye.slash")
                                    .font(.caption)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Review")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private func analysisView(_ analysis: PlaythroughAnalysis) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(analysis.outcome).font(.headline)
            Text(analysis.overall)
            if !analysis.strengths.isEmpty {
                Text("Strengths").font(.subheadline.bold())
                ForEach(analysis.strengths, id: \.self) {
                    Label($0, systemImage: "hand.thumbsup")
                        .font(.subheadline)
                }
            }
            if !analysis.improvements.isEmpty {
                Text("Try next time").font(.subheadline.bold())
                ForEach(analysis.improvements, id: \.self) {
                    Label($0, systemImage: "arrow.up.right")
                        .font(.subheadline)
                }
            }
        }
    }

    private func load() async {
        do {
            let loaded = try await APIClient.shared.review(playthroughId: playthroughId)
            review = .loaded(loaded)
            analysis = loaded.analysis
        } catch {
            if case .loading = review { review = .failed(error) }
        }
    }

    private func analyze() async {
        analyzing = true
        defer { analyzing = false }
        analysis = try? await APIClient.shared.analyze(playthroughId: playthroughId)
    }
}
