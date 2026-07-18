import SwiftUI

/// The three states every server-backed screen renders. Reload keeps stale content
/// visible while refreshing (`loaded` + `.refreshable`), so this only models the
/// initial fetch.
enum Loadable<Value> {
    case loading
    case failed(Error)
    case loaded(Value)
}

/// Standard wrapper: spinner → error-with-retry → content.
struct LoadableView<Value, Content: View>: View {
    let state: Loadable<Value>
    let retry: () async -> Void
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        switch state {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let error):
            ContentUnavailableView {
                Label("Something went wrong", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.localizedDescription)
            } actions: {
                Button("Try Again") { Task { await retry() } }
                    .buttonStyle(.borderedProminent)
            }
        case .loaded(let value):
            content(value)
        }
    }
}

struct ScenarioRow: View {
    let scenario: Scenario

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(scenario.title)
                    .font(.headline)
                Spacer()
                if scenario.isLiving {
                    Badge(text: "LIVE", color: .red)
                }
                if scenario.isPremium {
                    Badge(text: "PREMIUM", color: .indigo)
                }
            }
            Text(scenario.premise)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(.vertical, 4)
    }
}

struct Badge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}

extension Date {
    var shortRelative: String {
        RelativeDateTimeFormatter().localizedString(for: self, relativeTo: .now)
    }
}
