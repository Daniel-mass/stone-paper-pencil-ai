import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Particle spawn
const spawnParticles = (color) => {
  const container = document.body;
  for (let i = 0; i < 20; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    particle.style.background = color;
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 50 + 20}%`;
    particle.style.animationDuration = `${Math.random() * 1 + 0.5}s`;
    container.appendChild(particle);
    setTimeout(() => container.removeChild(particle), 1000);
  }
};

// Sound files
const sounds = {
  click: new Audio("https://assets.codepen.io/605876/click.mp3"),
  win: new Audio("https://assets.codepen.io/605876/win.mp3"),
  lose: new Audio("https://assets.codepen.io/605876/lose.mp3"),
  draw: new Audio("https://assets.codepen.io/605876/draw.mp3")
};

const MOVES = ["Stone", "Paper", "Scissor"];
const EMOJI = { Stone: "🪨", Paper: "📄", Scissor: "✏️" };
const beats = { Stone: "Scissor", Paper: "Stone", Scissor: "Paper" };

function decideWinner(player, ai) {
  if (player === ai) return "draw";
  return beats[player] === ai ? "player" : "ai";
}

export default function App() {
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [playerMove, setPlayerMove] = useState(null);
  const [aiMove, setAiMove] = useState(null);
  const [result, setResult] = useState("");
  const [mode, setMode] = useState("Smart AI");
  const [loading, setLoading] = useState(false);
  const [taunt, setTaunt] = useState("");
  const [confidence, setConfidence] = useState(null);
  const [historyChart, setHistoryChart] = useState([]);

  const historyRef = useRef({ rounds: [], counts: { Stone: 0, Paper: 0, Scissor: 0 } });

  const mood = useMemo(() => {
    const diff = aiScore - playerScore;
    if (diff >= 2) return "cocky";
    if (diff <= -2) return "salty";
    return "focused";
  }, [aiScore, playerScore]);

  const jsFallback = () => {
    const { counts } = historyRef.current;
    const mostPlayed = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || MOVES[Math.floor(Math.random() * 3)];
    const counter = Object.entries(beats).find(([, v]) => v === mostPlayed)?.[0] || MOVES[Math.floor(Math.random() * 3)];
    return { move: counter, confidence: 55 };
  };

  const fetchLLMMove = async (lastPlayerMove) => {
    if (mode === "Easy") return jsFallback();

    try {
      const prompt = `
        You are an AI playing Stone-Paper-Scissor.
        The player just played: ${lastPlayerMove}.
        Suggest your next move: Stone, Paper, or Scissor.
        Respond ONLY with JSON: { "move": "Stone", "confidence": 0-100 }.
      `;
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-v1",
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw);
      return {
        move: parsed.move || MOVES[Math.floor(Math.random() * 3)],
        confidence: parsed.confidence || 50
      };
    } catch (err) {
      console.warn("DeepSeek API failed, using fallback.", err);
      return jsFallback();
    }
  };

  const speak = (text) => {
    if ("speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.pitch = 1.2;
      window.speechSynthesis.speak(utter);
    }
  };

  const finalizeRound = (p, a, outcome) => {
    if (outcome === "player") {
      setPlayerScore((s) => s + 1);
      sounds.win.play();
      spawnParticles("#00FF00");
      speak(`You win! I played ${a}`);
    }
    if (outcome === "ai") {
      setAiScore((s) => s + 1);
      sounds.lose.play();
      spawnParticles("#FF0000");
      speak(`I win! I played ${a}`);
    }
    if (outcome === "draw") {
      sounds.draw.play();
      spawnParticles("#FFD700");
      speak(`Draw! Both played ${p}`);
    }

    historyRef.current.rounds.push({ player: p, ai: a, winner: outcome });
    historyRef.current.counts[p] = (historyRef.current.counts[p] || 0) + 1;

    setHistoryChart((prev) => [...prev, { round: prev.length + 1, player: playerScore + (outcome === "player" ? 1 : 0), ai: aiScore + (outcome === "ai" ? 1 : 0) }]);

    const tauntMessages = {
      cocky: ["I'm unstoppable!", "Try harder! 😎"],
      salty: ["You got lucky!", "Don't think you can win! 😏"],
      focused: ["I'm watching you!", "Nice try! 😉"]
    };
    setTaunt(tauntMessages[mood][Math.floor(Math.random() * 2)]);

    if (outcome === "draw") setResult(`Draw! Both played ${EMOJI[p]}`);
    if (outcome === "player") setResult(`You Win! ${EMOJI[p]} beats ${EMOJI[a]}`);
    if (outcome === "ai") setResult(`AI Wins! ${EMOJI[a]} beats ${EMOJI[p]}`);
  };

  const play = async (playerSel) => {
    sounds.click.play();
    setPlayerMove(playerSel);
    setAiMove(null);
    setResult("");
    setConfidence(null);
    setTaunt("");
    setLoading(true);

    try {
      const aiDecision = await fetchLLMMove(playerSel);
      const aiSel = aiDecision?.move || MOVES[Math.floor(Math.random() * 3)];
      const conf = Math.max(0, Math.min(100, aiDecision?.confidence || 50));
      setAiMove(aiSel);
      setConfidence(conf);
      const outcome = decideWinner(playerSel, aiSel);
      finalizeRound(playerSel, aiSel, outcome);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPlayerScore(0);
    setAiScore(0);
    setPlayerMove(null);
    setAiMove(null);
    setResult("");
    setConfidence(null);
    setTaunt("");
    setHistoryChart([]);
    historyRef.current = { rounds: [], counts: { Stone: 0, Paper: 0, Scissor: 0 } };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-400 via-black to-gray-900 flex flex-col items-center justify-center p-4 overflow-hidden">
      <div className="max-w-3xl w-full p-6 space-y-6 backdrop-blur-lg bg-black/30 rounded-3xl border border-yellow-400/40 shadow-2xl relative z-10">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-white tracking-tight">
          🧠 DeepSeek AI Showdown
        </h1>

        {/* Scoreboard */}
        <div className="grid grid-cols-2 gap-6 text-center backdrop-blur-lg bg-black/30 border border-yellow-400/30 rounded-3xl p-6 shadow-lg">
          <div>
            <div className="text-gray-300 uppercase text-sm">Player</div>
            <div className="text-5xl font-extrabold text-emerald-400">{playerScore}</div>
          </div>
          <div>
            <div className="text-gray-300 uppercase text-sm">AI</div>
            <div className="text-5xl font-extrabold text-rose-400">{aiScore}</div>
          </div>
        </div>

        {/* AI Mood + Confidence */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${mood==="cocky"?"bg-rose-400":mood==="salty"?"bg-amber-300":"bg-yellow-400"} animate-pulse`} />
            <span className="text-gray-200 text-sm">AI Mood: <span className="font-semibold capitalize">{mood}</span></span>
          </div>
          {confidence !== null && (
            <div className="w-1/3 bg-black/20 rounded-full h-2 overflow-hidden shadow-inner">
              <div className="h-2 bg-gradient-to-r from-yellow-400 via-orange-400 to-white transition-all duration-500" style={{ width: `${confidence}%` }}></div>
            </div>
          )}
        </div>

        {/* Moves */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {MOVES.map((m) => (
            <button
              key={m}
              onClick={() => play(m)}
              disabled={loading}
              className="relative overflow-hidden rounded-2xl border border-yellow-400/30 bg-black/20 px-6 py-5 text-left transition transform hover:scale-105 hover:bg-black/30 shadow-lg backdrop-blur-md"
            >
              <div className="flex items-center justify-between">
                <div className="text-4xl">{EMOJI[m]}</div>
                <div className="text-xl font-semibold text-gray-200">{m}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="text-center text-lg font-semibold text-gray-200 mt-2">{result || "Make your move!"}</div>
        <div className="text-center text-sm text-yellow-200 italic">{taunt}</div>

        {/* Mode & Reset */}
        <div className="flex justify-between items-center mt-4">
          <select value={mode} onChange={(e)=>setMode(e.target.value)} className="bg-black/20 border border-yellow-400/30 rounded-xl px-3 py-2 text-sm text-gray-200 backdrop-blur-md">
            <option>Smart AI</option>
            <option>Easy</option>
          </select>
          <button onClick={reset} className="bg-black/20 px-4 py-2 rounded-xl border border-yellow-400/30 hover:bg-black/30 shadow-md backdrop-blur-md transition">
            Reset
          </button>
        </div>

        {/* History Chart */}
        {historyChart.length > 0 && (
          <div className="mt-6 bg-black/30 p-4 rounded-2xl border border-yellow-400/30">
            <h2 className="text-yellow-400 text-center font-semibold mb-2">Score History</h2>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={historyChart}>
                <XAxis dataKey="round" stroke="#FFD700" />
                <YAxis stroke="#FFD700" />
                <Tooltip contentStyle={{ backgroundColor: "#000", border: "1px solid #FFD700", color: "#FFD700" }} />
                <Line type="monotone" dataKey="player" stroke="#00FF00" strokeWidth={2} />
                <Line type="monotone" dataKey="ai" stroke="#FF0000" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 mt-4">
          DeepSeek AI • Claude fallback • Glassmorphism • Neon Mood & Score • Voice, Particles & Sounds
        </div>
      </div>

      {/* Particles CSS */}
      <style>{`
        .particle {
          position: fixed;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          pointer-events: none;
          opacity: 0.8;
          animation: floatUp 1s linear forwards;
          z-index: 50;
        }
        @keyframes floatUp {
          0% {transform: translateY(0) scale(1);}
          100% {transform: translateY(-150px) scale(0);}
        }
      `}</style>

      {/* Background music */}
      <audio autoPlay loop src="https://assets.codepen.io/605876/background-music.mp3" />
    </div>
  );
}
