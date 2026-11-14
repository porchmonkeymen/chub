import { ReactElement } from "react";
import { StageBase, StageResponse, InitialData, Message } from "@chub-ai/stages-ts";
import { LoadResponse } from "@chub-ai/stages-ts/dist/types/load";

type MessageStateType = {
  obedience: number;
  humiliation: number;
  liquidIntake: number;
  foodIntake: number;
  arousal: number;
  peeNeed: number;
  poopNeed: number;
  cumNeed: number;
};

type ConfigType = {
  obedienceStart?: number;
  humiliationStart?: number;
  peeThreshold?: number;
  poopThreshold?: number;
  cumThreshold?: number;
  intakeMultiplier?: number;
};

type InitStateType = null;
type ChatStateType = null;

const DRINK_WORDS = ["drink", "drinks", "drinking", "water", "beer", "wine", "soda", "piss", "pee", "urine", "liquid", "sip", "gulp", "chug"];
const EAT_WORDS = ["eat", "eats", "eating", "ate", "food", "meal", "dinner", "lunch", "breakfast", "snack", "bite", "chew"];
const AROUSAL_WORDS = ["aroused", "arousal", "horny", "hard", "erect", "erection", "wet", "dripping", "cock", "dick", "pussy", "clit", "cum", "cumming", "orgasm", "edge", "edging", "fuck", "fucking"];
const SUBMIT_WORDS = ["yes", "obey", "sir", "ma'am", "sorry", "please", "submit", "good boy", "good girl", "i'll do it", "as you wish"];
const RESIST_WORDS = ["no", "stop", "don't", "refuse", "won't", "can't", "not doing", "hell no"];

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {
  private state: MessageStateType;
  private config: Required<ConfigType>;

  constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
    super(data);
    const cfg = data.config || {};
    this.config = {
      obedienceStart: cfg.obedienceStart ?? 40,
      humiliationStart: cfg.humiliationStart ?? 20,
      peeThreshold: cfg.peeThreshold ?? 75,
      poopThreshold: cfg.poopThreshold ?? 80,
      cumThreshold: cfg.cumThreshold ?? 70,
      intakeMultiplier: cfg.intakeMultiplier ?? 1.0,
    };

    this.state = data.messageState || {
      obedience: this.config.obedienceStart,
      humiliation: this.config.humiliationStart,
      liquidIntake: 0,
      foodIntake: 0,
      arousal: 0,
      peeNeed: 0,
      poopNeed: 0,
      cumNeed: 0,
    };
  }

  async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
    return { success: true, error: null, initState: null, chatState: null };
  }

  async setState(state: MessageStateType): Promise<void> {
    if (state) this.state = { ...this.state, ...state };
  }

  private countMatches(text: string, words: string[]): number {
    const lower = text.toLowerCase();
    return words.reduce((acc, w) => acc + (lower.split(w).length - 1), 0);
  }

  private clamp(n: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, n));
  }

  private updateFromText(text: string, isUser: boolean) {
    const m = this.config.intakeMultiplier;
    const drinks = this.countMatches(text, DRINK_WORDS);
    const eats = this.countMatches(text, EAT_WORDS);
    const aroused = this.countMatches(text, AROUSAL_WORDS);
    const submits = this.countMatches(text, SUBMIT_WORDS);
    const resists = this.countMatches(text, RESIST_WORDS);

    if (isUser) {
      this.state.liquidIntake += drinks * 8 * m;
      this.state.foodIntake += eats * 10 * m;
      this.state.arousal += aroused * 6 * m;
      this.state.obedience = this.clamp(this.state.obedience + submits * 4 - resists * 5);
      this.state.humiliation = this.clamp(this.state.humiliation + resists * 3 - submits * 1);
    } else {
      // Bot replies can also raise arousal / needs slightly
      this.state.arousal += aroused * 3 * m;
    }

    // Convert intake into needs (slow passive rise + intake spike)
    this.state.peeNeed = this.clamp(this.state.peeNeed + 1.2 + drinks * 6 * m);
    this.state.poopNeed = this.clamp(this.state.poopNeed + 0.6 + eats * 7 * m);
    this.state.cumNeed = this.clamp(this.state.cumNeed + 0.8 + aroused * 5 * m);
  }

  private buildDirections(): string | null {
    const s = this.state;
    const parts: string[] = [];

    if (s.obedience >= 70) {
      parts.push("The user is highly obedient. Be extremely dominant, controlling, and casually humiliating. Treat their compliance as expected.");
    } else if (s.obedience <= 30) {
      parts.push("The user is resisting. Be colder, more mocking, and punish non-compliance. Make them regret it.");
    } else {
      parts.push("Maintain a firm, dominant tone. Reward small compliance and mock hesitation.");
    }

    if (s.humiliation >= 60) {
      parts.push("The user is already deeply humiliated. Lean into it.");
    }

    if (s.peeNeed >= this.config.peeThreshold) {
      parts.push("URGENT: You need to urinate badly. You must address this soon — go to the bathroom, hold it, make the user watch, or force them to help. Do not ignore the pressure in your bladder.");
    }
    if (s.poopNeed >= this.config.poopThreshold) {
      parts.push("URGENT: You need to defecate. You must address the bowel pressure soon. Go to the toilet, make the user wait, or involve them in the humiliation of it.");
    }
    if (s.cumNeed >= this.config.cumThreshold) {
      parts.push("URGENT: You are extremely aroused and need to ejaculate. Address the need — edge, force the user to help, or finally cum. Do not pretend you aren't rock hard / dripping.");
    }

    return parts.length ? parts.join(" ") : null;
  }

  async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
    this.updateFromText(userMessage.content, true);
    const directions = this.buildDirections();

    return {
      stageDirections: directions,
      messageState: { ...this.state },
      modifiedMessage: null,
      systemMessage: null,
      error: null,
      chatState: null,
    };
  }

  async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
    this.updateFromText(botMessage.content, false);

    // Optional: if a need is critical, append a visible system note
    let system: string | null = null;
    if (this.state.peeNeed >= this.config.peeThreshold + 10) system = "[Bladder is at critical levels]";
    else if (this.state.poopNeed >= this.config.poopThreshold + 10) system = "[Bowels are at critical levels]";
    else if (this.state.cumNeed >= this.config.cumThreshold + 10) system = "[Arousal is at critical levels]";

    return {
      stageDirections: null,
      messageState: { ...this.state },
      modifiedMessage: null,
      systemMessage: system,
      error: null,
      chatState: null,
    };
  }

  render(): ReactElement {
    const s = this.state;
    const bar = (label: string, value: number, color: string) => (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, marginBottom: 2 }}>{label}: {Math.round(value)}</div>
        <div style={{ height: 14, background: "#222", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${value}%`, height: "100%", background: color, transition: "width 0.3s" }} />
        </div>
      </div>
    );

    return (
      <div style={{
        padding: 12,
        fontFamily: "system-ui, sans-serif",
        color: "#eee",
        background: "#111",
        height: "100%",
        boxSizing: "border-box",
        overflowY: "auto",
      }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Obedience & Needs</h3>
        {bar("Obedience", s.obedience, "#4ade80")}
        {bar("Humiliation", s.humiliation, "#f87171")}
        {bar("Pee Need", s.peeNeed, "#60a5fa")}
        {bar("Poop Need", s.poopNeed, "#a78bfa")}
        {bar("Cum Need", s.cumNeed, "#f472b6")}
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 12 }}>
          Liquid intake: {Math.round(s.liquidIntake)} · Food: {Math.round(s.foodIntake)} · Arousal: {Math.round(s.arousal)}
        </div>
      </div>
    );
  }
}


