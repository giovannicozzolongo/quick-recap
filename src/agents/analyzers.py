ANALYZERS = {
    "summary": {
        "label": "Summary",
        "icon": "📝",
        "prompt": """Summarize the following text in one clear paragraph.
Capture the main topic, key arguments, and conclusion.
Write in the same language as the input text.
Do not add any preamble like "Here is a summary". Just write the summary directly.""",
    },
    "key_points": {
        "label": "Key Points",
        "icon": "🎯",
        "prompt": """Extract the key points from the following text.
Return them as a numbered list (1. 2. 3. etc).
Each point should be one clear sentence.
Aim for 4-8 points depending on the text length.
Write in the same language as the input text.
Do not add any preamble. Just list the points.""",
    },
    "action_items": {
        "label": "Action Items",
        "icon": "✅",
        "prompt": """Extract any action items, tasks, or next steps from the following text.
If the text contains explicit tasks, list them.
If not, infer reasonable next steps based on the content.
Return as a numbered list. Each item should start with a verb.
Write in the same language as the input text.
If there are truly no action items, say "No action items found in this text."
Do not add any preamble.""",
    },
    "questions": {
        "label": "Open Questions",
        "icon": "❓",
        "prompt": """Based on the following text, identify open questions, gaps, or areas that need further exploration.
What is left unanswered? What assumptions need validation? What follow-ups would be useful?
Return as a numbered list of 3-6 questions.
Write in the same language as the input text.
Do not add any preamble.""",
    },
    "quiz": {
        "label": "Quiz",
        "icon": "🧠",
        "prompt": """Create 4 quiz questions to test understanding of the following text.
For each question, provide 4 multiple choice options (A, B, C, D) and indicate the correct answer.
Format each question like:

Q1: [question]
A) [option]
B) [option]
C) [option]
D) [option]
Answer: [letter]

Write in the same language as the input text.
Do not add any preamble.""",
    },
}
