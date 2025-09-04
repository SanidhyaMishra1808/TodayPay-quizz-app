import { useRef, useState, useEffect } from 'react';
import './Quiz.css'

// quick helper to turn weird HTML entities (like &amp;) into readable text
function decodeStuff(str) {
    const parser = new DOMParser().parseFromString(str, "text/html");
    return parser.documentElement.textContent;
}

const Quiz = () => {
    // main quiz state
    const [currIndex, setCurrIndex] = useState(0);
    const [currQ, setCurrQ] = useState(null);
    const [isLocked, setIsLocked] = useState(false);
    const [points, setPoints] = useState(0);
    const [finished, setFinished] = useState(false);
    const [questions, setQuestions] = useState([]);
    const [answerLog, setAnswerLog] = useState([]);
    const [errMsg, setErrMsg] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // references for answer buttons (probably could do this differently but fine for now)
    const ref1 = useRef(null);
    const ref2 = useRef(null);
    const ref3 = useRef(null);
    const ref4 = useRef(null);
    const refs = [ref1, ref2, ref3, ref4];

    // try to restore old quiz session if it exists
    useEffect(() => {
        const saved = localStorage.getItem("quiz-progress");
        if (saved) {
            const parsed = JSON.parse(saved);
            setCurrIndex(parsed.index);
            setPoints(parsed.score);
            setFinished(parsed.result);
            setAnswerLog(parsed.answers);
            setQuestions(parsed.data);
            setCurrQ(parsed.data[parsed.index]);
            setIsLoading(false);
            return;
        }
        getQuestions();
    }, []);

    // persist quiz progress after *any* change
    useEffect(() => {
        if (questions.length > 0) {
            localStorage.setItem("quiz-progress", JSON.stringify({
                index: currIndex,
                score: points,
                result: finished,
                answers: answerLog,
                data: questions
            }));
        }
    }, [currIndex, points, finished, answerLog, questions]);

    // actually fetch the data
    async function getQuestions() {
        setIsLoading(true);
        setErrMsg(null);

        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 8000);

            const res = await fetch(
                'https://opentdb.com/api.php?amount=10&category=15&difficulty=medium&type=multiple',
                { signal: ctrl.signal }
            );
            clearTimeout(timer);

            if (!res.ok) throw new Error("Network died");
            const data = await res.json();

            if (!data.results || !data.results.length) {
                throw new Error("No questions found, weird...");
            }

            // shuffle and map data into something usable
            const formatted = data.results.map((q, i) => {
                const cleanQ = decodeStuff(q.question);

                const options = [
                    ...q.incorrect_answers.map(x => decodeStuff(x)),
                    decodeStuff(q.correct_answer)
                ];

                // simple shuffle
                const shuffled = options.sort(() => Math.random() - 0.5);
                const correctIndex = shuffled.indexOf(decodeStuff(q.correct_answer)) + 1;

                return {
                    id: i + 1,
                    question: cleanQ,
                    option1: shuffled[0],
                    option2: shuffled[1],
                    option3: shuffled[2],
                    option4: shuffled[3],
                    ans: correctIndex
                };
            });

            setQuestions(formatted);
            setCurrQ(formatted[0]);
        } catch (err) {
            setErrMsg(err.message || "Couldn’t load questions");
        } finally {
            setIsLoading(false);
        }
    }

    // check if chosen answer is correct
    function checkAnswer(e, optionIdx) {
        if (isLocked) return;

        const chosen = currQ[`option${optionIdx}`];
        const rightOne = currQ[`option${currQ.ans}`];

        if (currQ.ans === optionIdx) {
            e.target.classList.add("correct");
            setPoints(p => p + 1);
            setAnswerLog(log => [...log, {
                question: currQ.question,
                selected: chosen,
                correct: rightOne,
                isCorrect: true,
                skipped: false
            }]);
        } else {
            e.target.classList.add("wrong");
            refs[currQ.ans - 1].current.classList.add("correct");
            setAnswerLog(log => [...log, {
                question: currQ.question,
                selected: chosen,
                correct: rightOne,
                isCorrect: false,
                skipped: false
            }]);
        }
        setIsLocked(true);
    }

    // move to next question
    const nextQ = () => {
        if (!isLocked) return;

        if (currIndex === questions.length - 1) {
            setFinished(true);
            return;
        }

        setCurrIndex(currIndex + 1);
        setCurrQ(questions[currIndex + 1]);
        setIsLocked(false);

        refs.forEach(r => {
            r.current.classList.remove("wrong");
            r.current.classList.remove("correct");
        });
    };

    // skipping logic (counts as wrong basically)
    const skipQ = () => {
        setAnswerLog(log => [...log, {
            question: currQ.question,
            selected: "Skipped",
            correct: currQ[`option${currQ.ans}`],
            isCorrect: false,
            skipped: true
        }]);

        if (currIndex === questions.length - 1) {
            setFinished(true);
            return;
        }

        setCurrIndex(currIndex + 1);
        setCurrQ(questions[currIndex + 1]);
        setIsLocked(false);
    };

    // reset quiz back to start
    const restartQuiz = () => {
        setCurrIndex(0);
        setPoints(0);
        setFinished(false);
        setIsLocked(false);
        setAnswerLog([]);
        setCurrQ(questions[0]);
        localStorage.removeItem("quiz-progress"); // wipe saved data
    };

    // basic progress bar calc
    const progress = questions.length > 0 ? ((currIndex + 1) / questions.length) * 100 : 0;

    return (
        <div className='container'>
            <h1>Quiz Time 🎉</h1>
            <hr />

            {isLoading && <h2>Loading...</h2>}
            {errMsg && (
                <div className="error">
                    <p>{errMsg}</p>
                    <button onClick={getQuestions}>Try Again</button>
                </div>
            )}

            {!isLoading && !errMsg && currQ && (
                <>
                    {!finished && (
                        <div className="score-progress">
                            <span className="score">Score: {points}</span>
                            <div className="progress-bar">
                                <div className="progress" style={{ width: `${progress}%` }}></div>
                            </div>
                            <span className="progress-text">{currIndex + 1} / {questions.length}</span>
                        </div>
                    )}

                    {finished ? (
                        <>
                            <h2>You got {points} / {questions.length}</h2>
                            <button onClick={restartQuiz}>Restart</button>
                            <div className="summary">
                                <h3>Answer Recap:</h3>
                                {answerLog.map((ans, idx) => (
                                    <div key={idx} className={`summary-item ${ans.skipped ? 'skipped' : ans.isCorrect ? 'correct' : 'wrong'}`}>
                                        <p><strong>Q{idx + 1}:</strong> {ans.question}</p>
                                        <p>Your Answer: <span>{ans.selected}</span></p>
                                        {(!ans.isCorrect || ans.skipped) && (
                                            <p>Correct Answer: <span>{ans.correct}</span></p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <h2>{currIndex + 1}. {currQ.question}</h2>
                            <ul>
                                <li ref={ref1} onClick={(e) => checkAnswer(e, 1)}>{currQ.option1}</li>
                                <li ref={ref2} onClick={(e) => checkAnswer(e, 2)}>{currQ.option2}</li>
                                <li ref={ref3} onClick={(e) => checkAnswer(e, 3)}>{currQ.option3}</li>
                                <li ref={ref4} onClick={(e) => checkAnswer(e, 4)}>{currQ.option4}</li>
                            </ul>
                            <div className="button-row">
                                <button onClick={skipQ}>Skip</button>
                                <button onClick={nextQ} disabled={!isLocked}>Next</button>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

export default Quiz;