const DEEPSEEK_PRIVACY =
  "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html?locale=en_US";
const DEEPSEEK_PLATFORM_TERMS =
  "https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html";
const DEEPSEEK_MODEL_INFO =
  "https://cdn.deepseek.com/policies/en-US/model-algorithm-disclosure.html";

const steps = [
  {
    number: "01",
    title: "Choose a scenario",
    body: "Start with a scenario from the library or describe an idea and let the builder draft one you can edit.",
  },
  {
    number: "02",
    title: "Take a role",
    body: "Pick who you are in the situation. Some practice scenarios also ask for a little context before the first turn.",
  },
  {
    number: "03",
    title: "Make the hard calls",
    body: "Each turn gives you the scene, what you can currently observe, and several actions. You can suggest your own action too.",
  },
  {
    number: "04",
    title: "Look behind the curtain",
    body: "When the run ends, review hidden facts and actor motives, then generate feedback on the decisions that mattered.",
  },
];

export default function FAQ() {
  return (
    <div className="faq-page">
      <header className="faq-hero">
        <p className="eyebrow">How it works</p>
        <h1>Practice the decision. Then see what you missed.</h1>
        <p className="page-intro">
          Scenario Sim is an AI game master for role-driven dilemmas. It gives you enough
          information to make a choice, keeps the rest of the world hidden, and reveals the full
          picture after the run.
        </p>
        <nav className="faq-jump-links" aria-label="On this page">
          <a href="#how-it-works">The play loop</a>
          <a href="#information-boundary">What stays hidden</a>
          <a href="#common-questions">Common questions</a>
          <a href="#privacy-safety">Privacy &amp; safety</a>
        </nav>
      </header>

      <section className="faq-block" id="how-it-works" aria-labelledby="how-heading">
        <p className="eyebrow">The play loop</p>
        <h2 id="how-heading">From premise to post-game review</h2>
        <ol className="how-steps">
          {steps.map((step) => (
            <li className="how-step" key={step.number}>
              <span className="how-step-number" aria-hidden="true">
                {step.number}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="faq-block"
        id="information-boundary"
        aria-labelledby="boundary-heading"
      >
        <p className="eyebrow">The important bit</p>
        <h2 id="boundary-heading">The game knows more than the player</h2>
        <p>
          Every generated turn is validated and split into two separate records. Play screens only
          receive the player-safe view. The hidden game-master state is available through the
          review flow, after you have made the decisions.
        </p>
        <div className="information-split">
          <div className="information-panel player-information">
            <span className="badge">During play</span>
            <h3>Player view</h3>
            <ul>
              <li>The unfolding narrative</li>
              <li>What your character can observe</li>
              <li>Available actions and player-safe reasoning</li>
            </ul>
          </div>
          <div className="information-arrow" aria-hidden="true">
            →
          </div>
          <div className="information-panel gm-information">
            <span className="badge completed">After the run</span>
            <h3>Game-master state</h3>
            <ul>
              <li>Hidden facts and agendas</li>
              <li>Each actor's intent and private reasoning</li>
              <li>Goal progress and post-game analysis</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="faq-block" id="common-questions" aria-labelledby="questions-heading">
        <p className="eyebrow">FAQ</p>
        <h2 id="questions-heading">Common questions</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary>Is this a game or a decision-practice tool?</summary>
            <p>
              Both, depending on the scenario. The library includes fictional stories, classic
              game-theory problems, negotiations, leadership situations, and real-world practice
              scenarios. Treat the result as a way to explore choices, not as a prediction.
            </p>
          </details>

          <details className="faq-item">
            <summary>Do I need an account?</summary>
            <p>
              No. You can browse, create scenarios, and play as a guest. Creating an account lets
              you carry that guest's scenarios and playthroughs across devices.
            </p>
          </details>

          <details className="faq-item">
            <summary>How are turns generated?</summary>
            <p>
              The current scenario snapshot, your role, the previous hidden state, and your choice
              are sent to the AI game master. Its response must pass a typed schema before it can
              become a turn. Invalid responses are retried, and successful requests are cached so
              the same action can be retried safely.
            </p>
          </details>

          <details className="faq-item">
            <summary>Can I make my own scenario?</summary>
            <p>
              Yes. Start with a short concept and the AI builder will draft the premise, setting,
              roles, non-player characters, goals, and private game-master notes. You can edit the
              draft before saving or playing it.
            </p>
          </details>

          <details className="faq-item">
            <summary>What is a living scenario?</summary>
            <p>
              A living scenario follows an ongoing real-world story. The system gathers new
              coverage, drafts a sourced update, and waits for human approval before publishing
              it. Every playthrough keeps the version it started with, so an update cannot change
              a game in progress.
            </p>
          </details>

          <details className="faq-item">
            <summary>Can I change or invent an action?</summary>
            <p>
              You can suggest an action that is not among the generated options. The game checks
              whether it is possible in the current situation; accepted actions join the choice
              list, while rejected ones include a player-safe explanation.
            </p>
          </details>
        </div>
      </section>

      <section className="faq-block" id="privacy-safety" aria-labelledby="safety-heading">
        <p className="eyebrow">Privacy &amp; safety</p>
        <h2 id="safety-heading">Use simulations as practice, not authority</h2>
        <p>
          Scenario Sim is experimental. Its responses are generated by an AI model and can be
          incomplete, misleading, or wrong.
        </p>

        <div className="faq-list safety-list">
          <details className="faq-item">
            <summary>Who generates the scenarios and responses?</summary>
            <p>
              Scenario Sim uses the DeepSeek API to generate intake questions, scenario turns,
              suggested actions, and analyses. DeepSeek is a third-party AI provider. Scenario Sim
              is not sponsored, endorsed, or operated by DeepSeek.
            </p>
          </details>

          <details className="faq-item">
            <summary>What information is sent to DeepSeek?</summary>
            <p>
              The app sends the scenario, the context you provide, your role, your choices, and the
              current simulated state when it needs a response. Do not enter names, addresses,
              dates of birth, account numbers, medical record numbers, confidential business
              information, or other identifying or sensitive information.
            </p>
            <p>
              DeepSeek's published privacy policy says its services are not designed for sensitive
              personal data, including health information. Review DeepSeek's current{" "}
              <a href={DEEPSEEK_PRIVACY} target="_blank" rel="noreferrer">
                privacy policy
              </a>{" "}
              and{" "}
              <a href={DEEPSEEK_PLATFORM_TERMS} target="_blank" rel="noreferrer">
                open-platform terms
              </a>
              .
            </p>
          </details>

          <details className="faq-item">
            <summary>What does Scenario Sim store, and can I delete it?</summary>
            <p>
              This deployment stores scenarios, playthroughs, choices, context-intake answers and
              summaries, generated responses, and cached model requests. Registered users can
              permanently delete their account and owned content from the iOS Account screen; the
              web app does not yet expose that control. Cached model requests are not linked to an
              account and may remain after account deletion, so avoid submitting information you
              would not want retained or processed by the AI provider.
            </p>
          </details>

          <details className="faq-item">
            <summary>Is this medical, legal, financial, or other professional advice?</summary>
            <p>
              No. The simulations are educational practice and do not provide diagnosis,
              treatment, triage, legal advice, financial advice, or any professional-client
              relationship. Do not make consequential decisions based on an AI response. Consult a
              qualified professional who can evaluate the real situation.
            </p>
          </details>

          <details className="faq-item">
            <summary>Can AI output be wrong?</summary>
            <p>
              Yes. AI can invent facts, misunderstand context, omit important risks, or express
              false confidence. DeepSeek's own model disclosure says generated content is for
              reference and should not be treated as professional advice. Read its{" "}
              <a href={DEEPSEEK_MODEL_INFO} target="_blank" rel="noreferrer">
                model and training disclosure
              </a>
              .
            </p>
          </details>
        </div>

        <div className="warning emergency-note">
          <h3>What should I do in an emergency?</h3>
          <p>
            Do not use Scenario Sim. Contact local emergency services or an appropriate crisis
            service immediately. The app cannot monitor you, contact responders, or guarantee that
            it will recognize an emergency.
          </p>
        </div>
      </section>

      <section className="faq-section disclaimer-section">
        <h2>Important disclaimer</h2>
        <p>
          Scenario Sim is provided "as is" for voluntary educational and entertainment use,
          without guarantees of accuracy, completeness, availability, fitness for a particular
          purpose, or outcomes. You remain responsible for verifying information and for your own
          decisions and actions. To the fullest extent permitted by applicable law, the operator
          disclaims liability for loss, injury, or damage arising from reliance on generated
          content or use of the service.
        </p>
      </section>
    </div>
  );
}
