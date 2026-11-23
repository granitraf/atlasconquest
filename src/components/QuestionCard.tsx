import { useEffect, useRef, useState } from 'react';
import { flagUrl } from '../data';
import { RECRUIT_QUESTIONS, WRONG_ANSWER_TROOP_LOSS, defenderKills, questionSeconds, soldiers, streakMultiplier, troopReward } from '../game/rules';
import { sound } from '../sound';
import type { Feedback, Question } from '../game/types';

const LETTERS = ['A', 'B', 'C', 'D'];
/** The countdown ticks aloud for this many of its last seconds. */
const COUNTDOWN_TICKS = 5;
/** How long answer feedback stays up before the game moves on by itself. */
const ADVANCE_MS = { correct: 1200, wrong: 3000 };

export type QuestionContext =
  /** The opening recruit phase: `streak` is the streak as it stood when the question appeared. */
  | { kind: 'recruit'; index: number; streak: number }
  | {
      kind: 'battle';
      /** The country under attack. */
      targetName: string;
      sea: boolean;
      onRetreat: () => void;
      /** Troops a retreat would cost right now. */
      retreatCost: number;
      /** False when a retreat would take the last troop. */
      canRetreat: boolean;
    };

interface Props {
  question: Question;
  feedback: Feedback | null;
  context: QuestionContext;
  onAnswer: (index: number | null) => void;
  /** Called when the answer feedback has been up long enough: the game moves on by itself. */
  onContinue: () => void;
}

/** Counts down the current question; fires onExpire once at zero. Stops while feedback is up. */
function useCountdown(active: boolean, key: string, seconds: number, onExpire: () => void): number {
  const [left, setLeft] = useState(seconds);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    if (!active) return;
    setLeft(seconds);
    const deadline = performance.now() + seconds * 1000;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, (deadline - performance.now()) / 1000);
      setLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        expire.current();
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [active, key, seconds]);
  return left;
}

export function QuestionCard({ question, feedback, context, onAnswer, onContinue }: Props) {
  const sea = context.kind === 'battle' && context.sea;
  const seconds = questionSeconds(sea);
  const answered = feedback !== null;
  // Every question is timed; running out counts as a wrong answer.
  const left = useCountdown(!answered, question.sig, seconds, () => onAnswer(null));
  const secondsShown = Math.ceil(left);
  const urgent = !answered && left <= COUNTDOWN_TICKS;
  useEffect(() => {
    // A clock ticks through the last five seconds.
    if (!answered && secondsShown <= COUNTDOWN_TICKS && secondsShown > 0) sound.tick(secondsShown);
  }, [secondsShown, answered]);

  // Feedback clears itself after a moment. There is no button to press: one that appears and
  // vanishes under the pointer only invites a click on whatever takes its place.
  const proceed = useRef(onContinue);
  proceed.current = onContinue;
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => proceed.current(), feedback.correct ? ADVANCE_MS.correct : ADVANCE_MS.wrong);
    return () => window.clearTimeout(timer);
  }, [feedback, question.sig]);

  // Keyboard: 1-4 or A-D to answer; Enter or Space skips the wait after an answer.
  const answer = useRef(onAnswer);
  answer.current = onAnswer;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (answered) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          proceed.current();
        }
        return;
      }
      const key = event.key.toUpperCase();
      const index = LETTERS.includes(key) ? LETTERS.indexOf(key) : ['1', '2', '3', '4'].indexOf(key);
      if (index >= 0 && index < question.options.length) answer.current(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, question]);

  const isFlags = question.type === 'flag';
  let reward: string;
  if (context.kind === 'recruit') {
    const base = troopReward(question.difficulty);
    // The multiplier that will apply if this answer is right.
    const multiplier = streakMultiplier(context.streak + 1);
    reward = `+${soldiers(base * multiplier)} troops${multiplier > 1 ? ` (×${multiplier} streak)` : ''}`;
  } else {
    reward = `defeats ${soldiers(defenderKills(question.difficulty))} enemies`;
  }

  let verdict: { title: string; detail: string } | null = null;
  if (feedback) {
    const troops = `+${soldiers(feedback.troopsGained)} troops`;
    if (feedback.correct) {
      const detail =
        context.kind === 'recruit'
          ? `${troops}${feedback.multiplier > 1 ? ` (×${feedback.multiplier} streak bonus)` : ''}.`
          : feedback.outcome === 'won'
            ? `${context.targetName} has fallen: ${troops}!`
            : `${soldiers(feedback.defendersKilled)} enemies down.`;
      verdict = { title: 'Correct!', detail };
    } else {
      const cost =
        context.kind === 'recruit'
          ? 'No troops earned, streak reset.'
          : feedback.outcome === 'lost'
            ? 'You lost your last troops. The attack has failed.'
            : `You lost ${soldiers(feedback.troopsLost)} troops.`;
      verdict = { title: feedback.timedOut ? 'Out of time!' : 'Wrong!', detail: cost };
    }
  }

  return (
    <section
      className={`card question ${answered ? (feedback.correct ? 'was-right' : 'was-wrong') : ''}`}
      aria-live="polite"
      data-testid="question-card"
      data-sig={question.sig}
    >
      <div className={`timer ${urgent ? 'urgent' : ''}`} aria-hidden="true">
        <div className="timer-bar" style={{ width: `${(left / seconds) * 100}%` }} />
      </div>
      <div
        className={`countdown ${urgent ? 'urgent' : ''} ${answered ? 'stopped' : ''}`}
        role="timer"
        aria-label={`${secondsShown} seconds left`}
        data-testid="timer"
        data-left={left.toFixed(1)}
        data-total={seconds}
      >
        <span className="countdown-num">{secondsShown}</span>
        <span className="countdown-unit">sec</span>
      </div>
      <div className="card-head">
        <span className="chip context">
          {context.kind === 'recruit'
            ? `Recruit ${context.index + 1}/${RECRUIT_QUESTIONS}`
            : `${context.sea ? 'Sea battle' : 'Battle'} · ${context.targetName}`}
        </span>
        <span className={`chip difficulty ${question.difficulty}`} data-testid="difficulty" data-value={question.difficulty}>
          <b>{question.difficulty}</b> · {reward}
        </span>
      </div>
      <h2 className="prompt">{question.prompt}</h2>
      <div className={`options ${isFlags ? 'flags' : ''}`}>
        {question.options.map((option, index) => {
          const isCorrect = index === question.correctIndex;
          const isChosen = feedback?.chosen === index;
          const state = !answered ? '' : isCorrect ? 'correct' : isChosen ? 'wrong' : 'dim';
          return (
            <button
              key={`${question.sig}-${index}`}
              type="button"
              className={`option ${state}`}
              disabled={answered}
              onClick={() => onAnswer(index)}
              data-testid={`option-${index}`}
            >
              <span className="option-key">{LETTERS[index]}</span>
              {option.flag ? (
                <span className="option-flag">
                  <img className="px-flag" src={flagUrl(option.flag, 'l')} alt={`Flag ${LETTERS[index]}`} draggable={false} />
                  {answered && <span className="flag-name">{option.label}</span>}
                </span>
              ) : (
                <span className="option-label">{option.label}</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="card-foot">
        {verdict && feedback ? (
          <p className={`verdict ${feedback.correct ? 'good' : 'bad'}`} data-testid="verdict">
            <strong>{verdict.title}</strong>{' '}
            {!feedback.correct && (
              <span className="answer-reveal">
                The answer was{' '}
                {feedback.correctFlag && <img className="px-flag inline-flag" src={flagUrl(feedback.correctFlag)} alt="" />}
                <b>{feedback.correctLabel}</b>.{' '}
              </span>
            )}
            <span>{verdict.detail}</span>
          </p>
        ) : (
          <>
            <p className="hint">
              {context.kind === 'recruit'
                ? 'Your one chance to recruit: after these five questions, troops come only from conquests.'
                : context.sea
                  ? `Sea crossing: ${seconds} seconds. Wrong or slow: −${soldiers(WRONG_ANSWER_TROOP_LOSS)} troops. 0 troops = game over.`
                  : `Wrong or slow: −${soldiers(WRONG_ANSWER_TROOP_LOSS)} troops. 0 troops = game over.`}
            </p>
            {context.kind === 'battle' && (
              <button
                type="button"
                className="btn ghost retreat"
                onClick={context.onRetreat}
                disabled={!context.canRetreat}
                data-testid="retreat"
                data-cost={context.canRetreat ? context.retreatCost : 0}
                title={
                  context.canRetreat
                    ? 'Pull out and keep your empire. It costs a quarter of your army and your streak; the enemies you have beaten stay down, and some return each time you attack another country.'
                    : 'You cannot retreat with your last troops.'
                }
              >
                {context.canRetreat ? (
                  <>
                    Retreat <b>−{soldiers(context.retreatCost)}</b>
                  </>
                ) : (
                  'No retreat'
                )}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
