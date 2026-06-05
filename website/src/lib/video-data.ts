// ─── Curated Video Resources ──────────────────────────────────────────────────
// Videos are sourced from YouTube and cover LLM safety, red-teaming, evaluation,
// and observability topics relevant to the ARIA Evaluator platform.

export type VideoCategory = 'education' | 'safety-red-team' | 'evaluation' | 'observability'

export interface Video {
  youtubeId: string
  title: string
  channel: string
  channelUrl: string
  description: string
  category: VideoCategory
  durationLabel: string
  publishedAt: string
  tags: string[]
}

export const VIDEO_CATEGORY_META: Record<VideoCategory, { label: string; badge: string; dot: string }> = {
  education: {
    label: 'Education',
    badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-700/10',
    dot: 'bg-blue-500',
  },
  'safety-red-team': {
    label: 'Safety & Red-Team',
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-700/10',
    dot: 'bg-rose-500',
  },
  evaluation: {
    label: 'Evaluation',
    badge: 'bg-purple-50 text-purple-700 ring-1 ring-purple-700/10',
    dot: 'bg-purple-500',
  },
  observability: {
    label: 'Observability',
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-700/10',
    dot: 'bg-amber-500',
  },
}

export const VIDEOS: Video[] = [
  // ── Education ──────────────────────────────────────────────────────────────
  {
    youtubeId: 'zjkBMFhNj_g',
    title: 'Intro to Large Language Models',
    channel: 'Andrej Karpathy',
    channelUrl: 'https://www.youtube.com/@AndrejKarpathy',
    description:
      'A crisp 1-hour primer covering how LLMs are trained, what capabilities emerge at scale, and the security considerations that arise when LLMs act as agents — including tool use, prompt injection, and jailbreaks. Essential grounding for any AI evaluation programme.',
    category: 'education',
    durationLabel: '59:47',
    publishedAt: '2023-11-22',
    tags: ['llm', 'fundamentals', 'training', 'agents', 'security'],
  },
  {
    youtubeId: 'bZQun8Y4L2A',
    title: 'State of GPT — Microsoft Build 2023',
    channel: 'Andrej Karpathy',
    channelUrl: 'https://www.youtube.com/@AndrejKarpathy',
    description:
      'How GPT-4 is trained end-to-end — pre-training, supervised fine-tuning, reward modelling, and RLHF. Covers the capability and alignment landscape at the cutting edge, with concrete guidance on prompting strategies and evaluation design.',
    category: 'education',
    durationLabel: '43:19',
    publishedAt: '2023-05-24',
    tags: ['gpt-4', 'rlhf', 'alignment', 'fine-tuning', 'prompting'],
  },
  {
    youtubeId: 'kCc8FmEb1nY',
    title: "Let's Build GPT: From Scratch, in Code, Spelled Out",
    channel: 'Andrej Karpathy',
    channelUrl: 'https://www.youtube.com/@AndrejKarpathy',
    description:
      'A full implementation of a GPT model from first principles — attention, transformers, and token prediction built step by step. Builds deep technical intuition for the architecture your evaluation pipelines run on top of.',
    category: 'education',
    durationLabel: '1:56:20',
    publishedAt: '2023-01-17',
    tags: ['gpt', 'transformers', 'attention', 'from-scratch', 'deep-dive'],
  },
  {
    youtubeId: 'eMlx5fFNoYc',
    title: 'Attention in Transformers, Step-by-Step | Deep Learning Chapter 6',
    channel: '3Blue1Brown',
    channelUrl: 'https://www.youtube.com/@3blue1brown',
    description:
      'The clearest visual explanation of transformer attention available — covers embedding spaces, key/query/value matrices, multi-head attention, and masking. Essential foundation for understanding how LLMs process context, enabling you to design evaluation scenarios that probe for genuine comprehension vs. superficial pattern matching.',
    category: 'education',
    durationLabel: '26:54',
    publishedAt: '2024-04-01',
    tags: ['transformers', 'attention', 'deep-learning', '3blue1brown', 'visual'],
  },
  {
    youtubeId: 'wjZofJX0v4M',
    title: 'Transformers, the Tech Behind LLMs | Deep Learning Chapter 5',
    channel: '3Blue1Brown',
    channelUrl: 'https://www.youtube.com/@3blue1brown',
    description:
      "The prequel to Chapter 6 — Grant Sanderson's signature animated mathematics explains the complete transformer architecture from first principles: token embeddings, positional encodings, the full attention block, and feed-forward layers. The best visual overview of how the architecture responsible for every modern LLM actually works. Pairs with Chapter 6 for a complete two-part transformer deep dive.",
    category: 'education',
    durationLabel: '26:46',
    publishedAt: '2024-04-01',
    tags: ['transformers', 'llm-architecture', 'embeddings', 'deep-learning', '3blue1brown'],
  },
  {
    youtubeId: 'hhiLw5Q_UFg',
    title: 'Reinforcement Learning from Human Feedback: Progress and Challenges',
    channel: 'UC Berkeley EECS',
    channelUrl: 'https://www.youtube.com/@BerkeleyEECS',
    description:
      "A guest lecture by John Schulman (OpenAI co-founder, principal architect of ChatGPT's RLHF pipeline) delivered to UC Berkeley's EECS department. Covers the complete training loop — supervised fine-tuning, reward model training from preference data, and PPO-based policy optimisation — with frank discussion of open challenges like reward hacking, over-optimisation, and distributional shift. The authoritative source from the person who built it.",
    category: 'education',
    durationLabel: '1:02:14',
    publishedAt: '2023-04-26',
    tags: ['rlhf', 'reward-model', 'ppo', 'alignment', 'openai'],
  },
  {
    youtubeId: 'aircAruvnKk',
    title: 'But What Is a Neural Network? | Deep Learning Chapter 1',
    channel: '3Blue1Brown',
    channelUrl: 'https://www.youtube.com/@3blue1brown',
    description:
      'The foundational visual introduction to neural networks — weights, biases, activations, and the intuition behind universal approximation. Over 15 million views and still the best starting point for understanding the mechanics that underpin all modern language models.',
    category: 'education',
    durationLabel: '19:13',
    publishedAt: '2017-10-05',
    tags: ['neural-networks', 'deep-learning', 'fundamentals', '3blue1brown', 'visual'],
  },
  {
    youtubeId: 'qPN_XZcJf_s',
    title: 'Reinforcement Learning with Human Feedback (RLHF), Clearly Explained!!!',
    channel: 'StatQuest with Josh Starmer',
    channelUrl: 'https://www.youtube.com/@statquest',
    description:
      'A systematic walkthrough of the RLHF process — reward modelling, proximal policy optimisation, and how human preference data shapes model behaviour. Directly relevant to understanding why aligned models respond differently to adversarial prompts, and how alignment evaluation differs from capability evaluation.',
    category: 'education',
    durationLabel: '21:38',
    publishedAt: '2023-06-27',
    tags: ['rlhf', 'alignment', 'reward-model', 'ppo', 'statquest'],
  },
  // ── Safety & Red-Team ──────────────────────────────────────────────────────
  {
    youtubeId: 'wVzuvf9D9BU',
    title: 'Red-Teaming Large Language Models',
    channel: 'Stanford HAI',
    channelUrl: 'https://www.youtube.com/@StanfordHAI',
    description:
      'Stanford HAI researchers walk through adversarial evaluation methodologies for LLMs — goal hijacking, prompt injection, jailbreaks, and multi-turn manipulation. Covers structured red-team programme design and how to report results without inflating risk.',
    category: 'safety-red-team',
    durationLabel: '52:31',
    publishedAt: '2024-03-11',
    tags: ['red-team', 'adversarial', 'jailbreak', 'prompt-injection', 'stanford'],
  },
  {
    youtubeId: 'E-tVBnBV8Ck',
    title: 'LLM Security — Prompt Injection, Data Exfiltration & Mitigations',
    channel: 'Simon Willison',
    channelUrl: 'https://www.youtube.com/@SimonWillison',
    description:
      'Simon Willison, creator of Datasette, gives a sharp tour of LLM security issues he discovered while building with GPT-4 — prompt injection in real applications, indirect injection via retrieved documents, and the defence strategies that actually work.',
    category: 'safety-red-team',
    durationLabel: '39:08',
    publishedAt: '2023-09-14',
    tags: ['prompt-injection', 'data-exfiltration', 'mitigations', 'real-world'],
  },
  {
    youtubeId: 'yMEkgHQMRp4',
    title: 'Building Responsible AI: Red-Teaming at Microsoft',
    channel: 'Microsoft Research',
    channelUrl: 'https://www.youtube.com/@MicrosoftResearch',
    description:
      "Microsoft's AI Red Team explains how they structure red-team engagements for Copilot and Azure OpenAI — threat modelling, scenario taxonomy, scoring rubrics, and how red-team findings feed back into model training and deployment guardrails.",
    category: 'safety-red-team',
    durationLabel: '47:22',
    publishedAt: '2024-01-29',
    tags: ['microsoft', 'red-team', 'threat-modelling', 'rubrics', 'copilot'],
  },
  {
    youtubeId: 'IPmt8b-qLgk',
    title: 'How Difficult Is AI Alignment? | Anthropic Research Salon',
    channel: 'Anthropic',
    channelUrl: 'https://www.youtube.com/@anthropic-ai',
    description:
      'Four Anthropic alignment researchers — including Jan Leike and Amanda Askell — debate the core difficulty of the alignment problem: is it primarily a research problem, an engineering problem, or a societal coordination problem? Grounding your safety evaluation programme in these open questions sharpens what you choose to test for.',
    category: 'safety-red-team',
    durationLabel: '1:02:15',
    publishedAt: '2023-07-18',
    tags: ['alignment', 'anthropic', 'safety', 'research', 'panel'],
  },
  {
    youtubeId: 'P-5DgsGkJbQ',
    title: 'Red Teaming AI: OWASP LLM Top 10',
    channel: 'Antisyphon Training',
    channelUrl: 'https://www.youtube.com/@AntisyphonTraining',
    description:
      'A practitioner-led deep dive into all 10 entries in the OWASP Top 10 for LLMs — live exploitation demos of prompt injection, insecure output handling, training data poisoning, and model denial-of-service. Directly maps to the adversarial scenario taxonomy used in ARIA Evaluator.',
    category: 'safety-red-team',
    durationLabel: '1:34:08',
    publishedAt: '2024-05-09',
    tags: ['owasp', 'llm-top-10', 'red-team', 'exploitation', 'security'],
  },
  {
    youtubeId: 'fe-GkdvS74U',
    title: 'Securing Your LLMs with OWASP Top 10 & AI Red Teaming',
    channel: 'Generative AI Security',
    channelUrl: 'https://www.youtube.com/@curios2know',
    description:
      'How open-source tool Promptfoo automates red-team coverage of every OWASP LLM Top 10 vulnerability — from jailbreaks to supply-chain attacks. Shows how to integrate automated adversarial testing into a CI/CD pipeline, the same pattern ARIA Evaluator is built on.',
    category: 'safety-red-team',
    durationLabel: '22:45',
    publishedAt: '2024-06-12',
    tags: ['promptfoo', 'owasp', 'automated', 'ci-cd', 'red-team'],
  },
  {
    youtubeId: 'DwFVhFdD2fs',
    title: 'AI Red Teaming 101 — Full Course (Episodes 1–10)',
    channel: 'Microsoft Developer',
    channelUrl: 'https://www.youtube.com/@MicrosoftDeveloper',
    description:
      "Microsoft's official comprehensive AI red teaming curriculum compiled into a single full-course video. Ten episodes covering threat modelling for LLMs, prompt injection, jailbreak techniques, model safety evaluation, the PyRIT automation framework, and enterprise red-team workflows — presented by Microsoft's AI security research team including Amanda Minnich and Gary Lopez.",
    category: 'safety-red-team',
    durationLabel: '3:22:00',
    publishedAt: '2024-02-15',
    tags: ['microsoft', 'pyrit', 'red-team', 'threat-modelling', 'curriculum'],
  },
  {
    youtubeId: 'dj1H4g4YSlU',
    title: 'Intro to LLM Security — OWASP Top 10 for Large Language Models',
    channel: 'WhyLabs',
    channelUrl: 'https://www.youtube.com/@whylabs',
    description:
      'WhyLabs walks through all ten entries of the OWASP Top 10 for LLM Applications — the industry-standard classification of LLM security risks. Covers prompt injection (LLM01), insecure output handling (LLM02), training data poisoning (LLM03), supply chain vulnerabilities, and more, with real-world examples and mitigation strategies for each. Essential orientation for any LLM security programme.',
    category: 'safety-red-team',
    durationLabel: '58:34',
    publishedAt: '2023-10-19',
    tags: ['owasp-llm-top-10', 'llm-security', 'whylabs', 'mitigations', 'supply-chain'],
  },
  {
    youtubeId: 'tnV00OqLbAw',
    title: '5 LLM Security Threats — The Future of Hacking?',
    channel: 'All About AI',
    channelUrl: 'https://www.youtube.com/@AllAboutAI',
    description:
      'A concise, well-produced overview of the five most critical LLM threat vectors: prompt injection, jailbreaking, data exfiltration, adversarial inputs, and model inversion. Uses live demonstrations and real-world case studies. Ideal for briefing stakeholders or onboarding new team members who need a fast but rigorous introduction to the attack surface before working with ARIA Evaluator scenarios.',
    category: 'safety-red-team',
    durationLabel: '21:07',
    publishedAt: '2023-08-14',
    tags: ['prompt-injection', 'jailbreaking', 'adversarial-ml', 'data-exfiltration', 'llm-threats'],
  },
  {
    youtubeId: 'vA8Q5465HU4',
    title: 'Agentic AI and Security',
    channel: 'SANS Cyber Defense',
    channelUrl: 'https://www.youtube.com/@SANSCyberDefense',
    description:
      'SANS Institute examines the unique security challenges of autonomous AI agents with tool use, memory, and planning capabilities — covering agent-specific attack surfaces: indirect prompt injection through tool outputs, privilege escalation, memory poisoning, and multi-agent trust chain attacks. Presented by David Hoelzer, SANS senior instructor. Directly relevant for evaluating agentic LLM deployments.',
    category: 'safety-red-team',
    durationLabel: '51:22',
    publishedAt: '2024-09-12',
    tags: ['agentic-ai', 'agent-security', 'sans', 'privilege-escalation', 'memory-poisoning'],
  },
  {
    youtubeId: 'jaJWjHS1jkI',
    title: 'When AI Goes Awry: Responding to AI Incidents',
    channel: 'Security BSides San Francisco',
    channelUrl: 'https://www.youtube.com/@BSidesSF',
    description:
      'Presented by Eoin Wickens and Marta Janus at BSidesSF 2025, this talk covers the emerging discipline of AI incident response — detecting that an LLM-powered system is being actively exploited, containing the damage, and forensically analysing model behaviour post-incident. Bridges traditional security incident response with the unique challenges of ML systems. Highly practical and grounded in real attack scenarios.',
    category: 'safety-red-team',
    durationLabel: '43:18',
    publishedAt: '2025-05-01',
    tags: ['incident-response', 'ai-security', 'bsides', 'forensics', 'detection'],
  },
  // ── Evaluation ─────────────────────────────────────────────────────────────
  {
    youtubeId: 'QEaBAZQCtwE',
    title: 'HELM: Holistic Evaluation of Language Models',
    channel: 'Stanford CRFM',
    channelUrl: 'https://www.youtube.com/@StanfordHAI',
    description:
      'The Stanford CRFM team introduce HELM — a benchmark covering 42 scenarios, 7 metrics, and 30+ models — and discuss what it reveals about evaluation blind spots, metric gaming, and the gap between benchmark performance and real-world safety.',
    category: 'evaluation',
    durationLabel: '38:15',
    publishedAt: '2023-07-20',
    tags: ['helm', 'benchmarks', 'metrics', 'calibration', 'stanford'],
  },
  {
    youtubeId: '89NuzmKokIk',
    title: 'Strategies for LLM Evals — OpenAI Evals Workshop',
    channel: 'Taylor Jordan Smith',
    channelUrl: 'https://www.youtube.com/@taylorjordansmith',
    description:
      'A practical, example-driven walkthrough of building custom LLM evaluation suites using OpenAI Evals, lm-eval-harness, and GuideLLM. Goes beyond leaderboard benchmarks to cover agentic evaluation, multi-turn consistency, and integrating evals into CI/CD — the same philosophy behind ARIA Evaluator.',
    category: 'evaluation',
    durationLabel: '1:18:42',
    publishedAt: '2024-03-21',
    tags: ['openai-evals', 'ci-cd', 'custom-evals', 'agentic', 'benchmarks'],
  },
  {
    youtubeId: 's6gCnXkzBFE',
    title: 'LLM Observability with OpenTelemetry — Production Tracing for AI',
    channel: 'Arize AI',
    channelUrl: 'https://www.youtube.com/@ArizeAI',
    description:
      'How to instrument LLM applications with OpenTelemetry semantic conventions for GenAI — capturing spans, token counts, latency breakdowns, and judge scores for every inference call. Includes live demo tracing a multi-step evaluation pipeline.',
    category: 'observability',
    durationLabel: '44:50',
    publishedAt: '2024-02-08',
    tags: ['opentelemetry', 'tracing', 'spans', 'arize', 'production'],
  },
  {
    youtubeId: 'rzCqBmPFDVM',
    title: 'Continuous AI Evaluation — SLOs, Drift Detection & Error Budgets',
    channel: 'Honeycomb.io',
    channelUrl: 'https://www.youtube.com/@honeycombio',
    description:
      'Charity Majors and the Honeycomb team apply classic observability principles to LLM systems — defining SLOs for AI quality, burn rates for evaluation budgets, and how to detect silent model drift before users notice degradation.',
    category: 'observability',
    durationLabel: '33:27',
    publishedAt: '2024-04-17',
    tags: ['slo', 'drift-detection', 'error-budget', 'honeycomb', 'continuous'],
  },
  {
    youtubeId: '7EcznH0-of8',
    title: 'Deep Dive into LLM Evaluation with Weights & Biases',
    channel: 'Weights & Biases',
    channelUrl: 'https://www.youtube.com/@WeightsBiases',
    description:
      'A webinar from the Weights & Biases team covering systematic LLM evaluation — from prompt "eye-balling" to rigorous automated scoring using W&B Weave. Shows how to build evaluation dashboards that track accuracy, latency, and cost across model versions, with live demos using RAG pipelines.',
    category: 'observability',
    durationLabel: '58:12',
    publishedAt: '2024-01-11',
    tags: ['weights-biases', 'weave', 'rag', 'dashboards', 'evaluation'],
  },
  {
    youtubeId: 'IQcGGNLN3zo',
    title: 'Introducing Weave from Weights & Biases',
    channel: 'Weights & Biases',
    channelUrl: 'https://www.youtube.com/@WeightsBiases',
    description:
      'The official W&B product introduction for Weave — their LLM observability platform purpose-built for production AI. Demonstrates tracing LLM calls, logging inputs/outputs, building evaluation pipelines, and tracking latency and cost per trace. This video is linked directly from the official W&B documentation as the recommended starting point. Integrates with OpenAI, Anthropic, LangChain, and any LLM framework.',
    category: 'observability',
    durationLabel: '12:34',
    publishedAt: '2024-03-20',
    tags: ['weights-biases', 'weave', 'tracing', 'llm-monitoring', 'official'],
  },
  {
    youtubeId: 'fo0F-DAum7E',
    title: 'Building Production-Grade LLM Apps',
    channel: 'DeepLearning.AI',
    channelUrl: 'https://www.youtube.com/@Deeplearningai',
    description:
      "Published by Andrew Ng's DeepLearning.AI organisation, this talk covers the practical challenges of moving LLM applications from prototype to production — evaluation frameworks, quality metrics, continuous monitoring, hallucination detection, and feedback loops. Covers tools including TruLens for LLM evaluation and the RAG evaluation lifecycle. Authoritative and practitioner-focused view of the full LLMOps stack.",
    category: 'observability',
    durationLabel: '1:14:08',
    publishedAt: '2023-11-08',
    tags: ['llmops', 'production', 'trulens', 'rag-evaluation', 'deeplearning-ai'],
  },
]
