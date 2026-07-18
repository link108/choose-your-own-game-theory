import SwiftUI

/// Pre-play intake for context-enabled scenarios: free-text context, then the
/// server's follow-up questions, looping until the assessment comes back "ready".
struct ContextIntakeView: View {
    let scenario: Scenario
    let roleName: String
    let onReady: (PlayerContext, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var context = PlayerContext(initialContext: "", answers: [])
    @State private var pendingQuestions: [String] = []
    @State private var pendingAnswers: [String] = []
    @State private var urgentWarning = ""
    @State private var submitting = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if !urgentWarning.isEmpty {
                    Section {
                        Label(urgentWarning, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
                if pendingQuestions.isEmpty {
                    Section {
                        Text(scenario.contextPrompt.isEmpty
                            ? "Describe your situation so the scenario can adapt to it."
                            : scenario.contextPrompt)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        TextField(
                            "Your situation", text: $context.initialContext, axis: .vertical
                        )
                        .lineLimit(6...12)
                    }
                } else {
                    Section("A few follow-ups") {
                        ForEach(pendingQuestions.indices, id: \.self) { i in
                            VStack(alignment: .leading) {
                                Text(pendingQuestions[i]).font(.subheadline)
                                TextField("Answer", text: $pendingAnswers[i], axis: .vertical)
                                    .lineLimit(2...6)
                            }
                        }
                    }
                }
                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        if submitting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Continue").frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(submitting || !canSubmit)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Before you start")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private var canSubmit: Bool {
        pendingQuestions.isEmpty
            ? !context.initialContext.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            : pendingAnswers.allSatisfy {
                !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
    }

    private func submit() async {
        submitting = true
        defer { submitting = false }
        error = nil
        for (question, answer) in zip(pendingQuestions, pendingAnswers) {
            context.answers.append(ContextAnswer(question: question, answer: answer))
        }
        pendingQuestions = []
        pendingAnswers = []
        do {
            let result = try await APIClient.shared.contextIntake(
                scenarioId: scenario.id, roleName: roleName, context: context)
            urgentWarning = result.urgentWarning
            if result.status == "ready" {
                onReady(context, result.summary)
            } else {
                pendingQuestions = result.questions
                pendingAnswers = Array(repeating: "", count: result.questions.count)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
