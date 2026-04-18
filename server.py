import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = "127.0.0.1"
PORT = 8000
BASE_DIR = Path(__file__).resolve().parent
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
OPENAI_URL = "https://api.openai.com/v1/responses"


def json_response(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw.decode("utf-8"))


def get_response_text(response_json):
    if isinstance(response_json.get("output_text"), str) and response_json["output_text"]:
      return response_json["output_text"]

    parts = []
    for item in response_json.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                parts.append(content.get("text", ""))
    return "".join(parts)


def call_openai(messages, schema_name, schema, description):
    if not OPENAI_API_KEY:
        raise RuntimeError("Missing OPENAI_API_KEY on the server.")

    payload = {
        "model": OPENAI_MODEL,
        "input": messages,
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "schema": schema,
                "strict": True,
                "description": description,
            }
        },
    }

    request = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            response_json = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"OpenAI request failed with status {error.code}: {details}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach OpenAI: {error.reason}") from error

    text = get_response_text(response_json)
    if not text:
        raise RuntimeError("OpenAI returned an empty response.")

    return json.loads(text)


def build_interview_prompt(config):
    candidate_name = config.get("candidateName") or "the candidate"
    return [
        {
            "role": "system",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        "You are an elite interview coach. Generate a realistic mock interview that feels like an actual interviewer. "
                        "Questions must be domain-specific, tailored to the role, and balanced across introduction, technical depth, "
                        "problem solving, behavioural judgment, confidence, and communication."
                    ),
                }
            ],
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        f"Create a 9-question interview for {candidate_name}. "
                        f"Domain: {config['domain']}. Track: {config['track']}. Position: {config['position']}. "
                        "Include at least 4 technical questions, at least 3 behavioural or personality questions, "
                        "and questions should be realistic for either an internship or a full-time role."
                    ),
                }
            ],
        },
    ]


INTERVIEW_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "questions": {
            "type": "array",
            "minItems": 9,
            "maxItems": 9,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["Introduction", "Technical", "Behavioural"],
                    },
                    "question": {"type": "string"},
                    "focus": {"type": "string"},
                },
                "required": ["category", "question", "focus"],
            },
        },
        "message": {"type": "string"},
    },
    "required": ["questions", "message"],
}


EVALUATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "total": {"type": "integer", "minimum": 0, "maximum": 100},
        "technical": {"type": "integer", "minimum": 0, "maximum": 100},
        "communication": {"type": "integer", "minimum": 0, "maximum": 100},
        "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
        "behaviour": {"type": "integer", "minimum": 0, "maximum": 100},
        "strengths": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 2,
            "maxItems": 4,
        },
        "improvements": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 2,
            "maxItems": 5,
        },
        "summary": {"type": "string"},
    },
    "required": [
        "total",
        "technical",
        "communication",
        "confidence",
        "behaviour",
        "strengths",
        "improvements",
        "summary",
    ],
}


def build_evaluation_prompt(payload):
    history_lines = []
    for item in payload.get("history", []):
        history_lines.append(
            f"- [{item['category']}] {item['question']} | score so far: {item['total']} | answer: {item['answer']}"
        )
    history_text = "\n".join(history_lines) if history_lines else "No previous answers."

    answer = payload.get("answer", "").strip()
    skipped = payload.get("skipped", False)

    rubric_note = (
        "If the answer is skipped or very short, score it low but still provide constructive coaching."
        if skipped or len(answer.split()) < 8
        else "Use the full rubric and be specific."
    )

    return [
        {
            "role": "system",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        "You are an interview assessor. Score the candidate out of 100 using four dimensions: "
                        "technical depth, communication clarity, confidence, and behaviour or presence. "
                        "Scores should be realistic, not inflated, and your coaching should be sharp and useful."
                    ),
                }
            ],
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        f"Candidate context: domain={payload['config']['domain']}, track={payload['config']['track']}, "
                        f"position={payload['config']['position']}.\n"
                        f"Current question category: {payload['question']['category']}.\n"
                        f"Current question: {payload['question']['question']}\n"
                        f"Answer: {answer or '[no answer provided]'}\n"
                        f"Previous rounds:\n{history_text}\n"
                        f"Scoring instruction: {rubric_note}\n"
                        "Return only the structured evaluation."
                    ),
                }
            ],
        },
    ]


class InterviewCoachHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_POST(self):
        if self.path == "/api/interview":
            self.handle_interview_generation()
            return

        if self.path == "/api/evaluate":
            self.handle_evaluation()
            return

        json_response(self, 404, {"error": "Not found"})

    def handle_interview_generation(self):
        payload = read_json(self)

        try:
            result = call_openai(
                build_interview_prompt(payload),
                "interview_questions",
                INTERVIEW_SCHEMA,
                "Interview session questions and setup message.",
            )
        except RuntimeError as error:
            json_response(self, 500, {"error": str(error)})
            return

        json_response(
            self,
            200,
            {
                "mode": "llm",
                "questions": result["questions"],
                "message": result["message"],
            },
        )

    def handle_evaluation(self):
        payload = read_json(self)

        try:
            result = call_openai(
                build_evaluation_prompt(payload),
                "interview_evaluation",
                EVALUATION_SCHEMA,
                "Interview answer scoring and coaching feedback.",
            )
        except RuntimeError as error:
            json_response(self, 500, {"error": str(error)})
            return

        json_response(self, 200, {"evaluation": result})


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), InterviewCoachHandler)
    print(f"Interview Coach server running at http://{HOST}:{PORT}")
    print(f"Using model: {OPENAI_MODEL}")
    print("Set OPENAI_API_KEY before starting to enable the LLM backend.")
    server.serve_forever()
