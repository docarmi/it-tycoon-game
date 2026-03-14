// Force update for GitHub sync
import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Briefcase, 
  CheckCircle2, 
  XCircle,
  Trophy,
  UserPlus,
  Search,
  LayoutDashboard,
  Settings,
  MessageSquare,
  Send,
  Loader2,
  Handshake,
  Heart,
  DollarSign,
  Star,
  Zap,
  Moon,
  Sun,
  GanttChart as GanttIcon,
  Mail,
  X,
  Clock,
  CheckCircle,
  Ghost,
  Copy,
  Link
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

// --- AI Setup ---
// The API key is injected by the platform.
// We instantiate GoogleGenAI inside functions to ensure the latest key is used.

const parseAIResponse = (text: string) => {
  if (!text || text.trim() === "") {
    return { text: "Désolé, je n'ai pas pu formuler de réponse. Pouvons-nous réessayer ?", status: "STAY", cancelResignation: false };
  }
  
  try {
    // Try simple parse first
    const parsed = JSON.parse(text);
    return {
      text: parsed.text || "...",
      status: parsed.status || "STAY",
      counterSalary: parsed.counterSalary,
      cancelResignation: parsed.cancelResignation === true
    };
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        return {
          text: parsed.text || "...",
          status: parsed.status || "STAY",
          counterSalary: parsed.counterSalary,
          cancelResignation: parsed.cancelResignation === true
        };
      } catch (e2) {
        console.error("Failed to parse extracted JSON", e2);
      }
    }
    
    // If it's still not JSON, try to find anything that looks like a JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          text: parsed.text || "...",
          status: parsed.status || "STAY",
          counterSalary: parsed.counterSalary,
          cancelResignation: parsed.cancelResignation === true
        };
      } catch (e3) {
        console.error("Failed to parse regex-matched JSON", e3);
      }
    }

    // Fallback: if it's just text, return it as text
    return { text: text, status: "STAY", cancelResignation: false };
  }
};

// --- Types ---

type Role = 
  | "Directeur de production"
  | "Directeur adjoint"
  | "Chargée de projet"
  | "Programmeur"
  | "Ingenieur informaticien";

interface Benefit {
  id: string;
  name: string;
  costPerEmployee: number;
  attractiveness: number;
}

interface Contract {
  id: string;
  title: string;
  requiredCapacity: number;
  monthlyRevenue: number;
  duration: number;
  remainingWeeks: number;
  workload: number;
  progress: number;
  requiredRoles: Role[];
  penalty: number;
}

interface ChatMessage {
  sender: 'player' | 'employee' | 'system';
  text: string;
  timestamp: number;
  companyName?: string;
}

type EmployeeStatus = 'Actif' | 'Maladie' | 'Congé' | 'Maternité' | 'Maladie long terme';

interface Employee {
  id: string;
  name: string;
  role: Role;
  seniority: "Stagiaire" | "Junior" | "Intermédiaire" | "Sénior";
  avatarUrl: string;
  minSalary: number;
  preferredBenefits: string[];
  currentEmployerId: string | null;
  isInternational?: boolean;
  chatHistory: ChatMessage[];
  productivityHistory: number[];
  resignationNotice: number | null;
  status: EmployeeStatus;
  leaveWeeksRemaining: number;
  hiredAtWeek?: number;
  isTargeted?: boolean;
  isLookingForJob?: boolean;
  personalBenefits?: string[];
}

interface InboxMessage {
  id: string;
  from: string;
  subject: string;
  text: string;
  read: boolean;
  week: number;
}

interface Player {
  id: string;
  companyName: string;
  money: number;
  employees: Employee[];
  benefits: string[];
  activeContracts: Contract[];
  lastRevenue: number;
  lastExpenses: number;
  weeksAtRisk: number;
  isUnderTutelage: boolean;
  targetedRecruitCount: number;
  targetedInternationalCount: number;
  totalHired: number;
  totalFired: number;
  customerSatisfaction: number;
  resignedThisWeek: Employee[];
  inbox: InboxMessage[];
}

interface GameState {
  players: [string, Player][];
  candidates: Employee[];
  availableContracts: Contract[];
  benefits: Benefit[];
  currentWeek: number;
  maxWeeks: number;
  roleCapacity: Record<Role, number>;
}

export default function App() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(localStorage.getItem('it_tycoon_player_id'));
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [companyName, setCompanyName] = useState(localStorage.getItem('it_tycoon_company_name') || '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [isJoined, setIsJoined] = useState(false);

  const GAME_URL = "https://it-tycoon-game.onrender.com";

  const invitePlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail.trim()) {
      const subject = encodeURIComponent("Rejoins-moi sur Chasseur de tête !");
      const body = encodeURIComponent(`Salut !\n\nJe t'invite à jouer à Chasseur de tête avec moi. Rejoins la partie ici : ${GAME_URL}\n\nÀ tout de suite !`);
      window.location.href = `mailto:${inviteEmail.trim()}?subject=${subject}&body=${body}`;
      setInviteEmail('');
    }
  };
  const [activeTab, setActiveTab] = useState<'dashboard' | 'market' | 'competition'>('dashboard');
  const [expandedContractId, setExpandedContractId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRecruitRole, setSelectedRecruitRole] = useState<Role | "">("");
  const [selectedRecruitSeniority, setSelectedRecruitSeniority] = useState<"Stagiaire" | "Junior" | "Intermédiaire" | "Sénior">("Junior");
  
  // Negotiation State
  const [selectedCandidate, setSelectedCandidate] = useState<Employee | null>(null);
  const [negotiationResult, setNegotiationResult] = useState<'ACCEPTED' | 'REFUSED' | null>(null);
  const [offeredSalary, setOfferedSalary] = useState<number>(0);
  const [offeredBenefits, setOfferedBenefits] = useState<string[]>([]);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [canAcceptCounter, setCanAcceptCounter] = useState(false);
  const [lastCounterOffer, setLastCounterOffer] = useState<{salary: number} | null>(null);
  const [negotiationChatInput, setNegotiationChatInput] = useState("");
  const [resignedEmployee, setResignedEmployee] = useState<Employee | null>(null);
  const [shownResignations, setShownResignations] = useState<Set<string>>(new Set());
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [isInboxOpen, setIsInboxOpen] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.geminiApiKey) setGeminiApiKey(data.geminiApiKey);
      })
      .catch(err => console.error("Failed to load config:", err));
  }, []);

  const safeSend = (data: any) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    } else {
      console.warn("Socket not open, message not sent:", data);
    }
  };

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("Global error caught:", event.error || event.message);
    };
    window.addEventListener('error', handleError);
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => console.log('Connected to server');
    ws.onerror = (event) => console.error('WebSocket error:', event);
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'INIT') {
          setPlayerId(message.playerId);
          try {
            localStorage.setItem('it_tycoon_player_id', message.playerId);
          } catch (e) {
            console.warn("Failed to save player ID to localStorage:", e);
          }
          setRoles(message.roles);
          if (message.roles.length > 0) setSelectedRecruitRole(message.roles[0]);
          setIsJoined(true);
        } else if (message.type === 'UPDATE') {
          setGameState(message.data);
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e, event.data);
      }
    };

    setSocket(ws);
    return () => {
      ws.close();
      window.removeEventListener('error', handleError);
    };
  }, []);

  const [activeChatEmployeeId, setActiveChatEmployeeId] = useState<string | null>(null);
  const [selectedPersonalBenefits, setSelectedPersonalBenefits] = useState<string[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    setSelectedPersonalBenefits([]);
  }, [activeChatEmployeeId]);

  useEffect(() => {
    const me = gameState?.players.find(([id]) => id === playerId)?.[1];
    if (me && me.resignedThisWeek.length > 0) {
      const newResignations = me.resignedThisWeek.filter(emp => !shownResignations.has(emp.id));
      if (newResignations.length > 0) {
        setResignedEmployee(newResignations[0]);
        setShownResignations(prev => {
          const next = new Set(prev);
          next.add(newResignations[0].id);
          return next;
        });
      }
    }
  }, [gameState, playerId, shownResignations]);

  // Clear shown resignations when week changes
  useEffect(() => {
    setShownResignations(new Set());
  }, [gameState?.currentWeek]);

  const activeChatEmployee = gameState?.players.find(([id]) => id === playerId)?.[1]?.employees.find(e => e.id === activeChatEmployeeId);

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeChatEmployeeId || !socket) return;

    const text = chatInput.trim();
    setChatInput("");

    // 1. Send player message to server
    safeSend({
      type: "SEND_CHAT",
      employeeId: activeChatEmployeeId,
      sender: "player",
      text
    });

    // 2. Generate AI response
    setIsTyping(true);
    try {
      const apiKey = geminiApiKey || (typeof process !== 'undefined' && process.env.GEMINI_API_KEY) || ((import.meta as any).env?.VITE_GEMINI_API_KEY as string);
      if (!apiKey) {
        console.error("Clé API Gemini manquante. Le chat ne fonctionnera pas sans clé API.");
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const me = gameState?.players.find(([id]) => id === playerId)?.[1];
      const employee = me?.employees.find(e => e.id === activeChatEmployeeId);
      
      if (!employee || !me) {
        console.warn("Employé ou joueur non trouvé pour la réponse AI.");
        return;
      }

      const isResigning = employee.resignationNotice !== null;
      const companyBenefits = me.benefits.map(bId => gameState?.benefits.find(b => b.id === bId)?.name).filter(Boolean).join(', ') || "Aucun avantage";
      
      let prompt = `Tu es ${employee.name}, un ${employee.seniority} ${employee.role} travaillant pour l'entreprise "${me.companyName}". 
      L'entreprise offre actuellement les avantages suivants : ${companyBenefits}.
      Ton employeur vient de t'envoyer ce message : "${text}". 
      Réponds de manière professionnelle mais naturelle, en tenant compte de ton rôle et de ton expérience. 
      Réponds en français, de manière concise (max 2-3 phrases).`;

      if (isResigning) {
        prompt += `\n\nIMPORTANT: Tu as récemment donné ton préavis de démission. Si le message de ton employeur répond à tes attentes (promesse de meilleurs avantages, ou de bons arguments), tu peux décider d'annuler ta démission.
        Tu dois répondre UNIQUEMENT au format JSON suivant :
        {
          "text": "Ta réponse à l'employeur",
          "cancelResignation": true ou false
        }`;
      }

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { 
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          ...(isResigning ? { responseMimeType: "application/json" } : {})
        }
      });

      let responseText = result.text || "Désolé, je suis un peu occupé pour le moment.";
      let cancelResignation = false;

      if (isResigning) {
        const parsed = parseAIResponse(responseText);
        responseText = parsed.text;
        cancelResignation = (parsed as any).cancelResignation === true || responseText.includes('"cancelResignation": true') || responseText.includes('"cancelResignation":true');
      }

      // 3. Send employee response to server
      safeSend({
        type: "SEND_CHAT",
        employeeId: activeChatEmployeeId,
        sender: "employee",
        text: responseText,
        cancelResignation
      });
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const joinGame = () => {
    if (socket && companyName.trim()) {
      localStorage.setItem('it_tycoon_company_name', companyName.trim());
      safeSend({ type: 'JOIN', companyName: companyName.trim(), playerId });
    }
  };

  const toggleBenefit = (benefitId: string) => {
    if (!socket || !playerId || !gameState) return;
    const me = gameState.players.find(([id]) => id === playerId)?.[1];
    if (!me) return;
    const newBenefits = me.benefits.includes(benefitId)
      ? me.benefits.filter(id => id !== benefitId)
      : [...me.benefits, benefitId];
    safeSend({ type: 'UPDATE_BENEFITS', benefits: newBenefits });
  };

  const fireEmployee = (employeeId: string) => {
    if (confirm("Voulez-vous vraiment licencier cet employé ?")) {
      safeSend({ type: 'FIRE', employeeId });
    }
  };

  const GanttChart = ({ contracts }: { contracts: Contract[] }) => {
    if (contracts.length === 0) return (
      <div className={`rounded-3xl p-12 text-center border-2 border-dashed transition-colors ${
        theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-gray-50 border-black/10'
      }`}>
        <p className={`text-sm italic ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Aucun contrat actif. Allez au marché pour en trouver.</p>
      </div>
    );

    return (
      <div className={`rounded-3xl border shadow-sm overflow-hidden transition-colors ${
        theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-white border-black/5'
      }`}>
        <div className={`p-6 border-b flex justify-between items-center ${theme === 'dark' ? 'border-white/10 bg-white/10' : 'border-black/5 bg-gray-50'}`}>
          <h3 className={`text-xs font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Suivi de Production (Gantt)</h3>
          <div className="flex gap-4 text-[10px] font-bold uppercase">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-hec-blue rounded-full"></div> Progress</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-rose-500 rounded-full"></div> Retard</div>
          </div>
        </div>
        <div className="p-8 space-y-8">
          {contracts.map(contract => {
            const progressPercent = Math.min(100, (contract.progress / contract.workload) * 100);
            const isLate = contract.remainingWeeks < 0;
            
            return (
              <div key={contract.id} className="space-y-3">
                <div className="flex justify-between items-end">
                  <div>
                    <h4 className="text-base font-bold">{contract.title}</h4>
                    <p className={`text-[10px] uppercase font-bold ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      {isLate ? (
                        <span className="text-rose-500">Retard: {Math.abs(contract.remainingWeeks)} sem. (-{contract.penalty.toLocaleString()} $/sem)</span>
                      ) : (
                        <span>Échéance: {contract.remainingWeeks} sem.</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold">{Math.floor(progressPercent)}%</span>
                  </div>
                </div>
                <div className={`h-3 rounded-full overflow-hidden relative ${theme === 'dark' ? 'bg-white/10' : 'bg-gray-100'}`}>
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    className={`h-full rounded-full ${isLate ? 'bg-rose-500' : 'bg-hec-blue'}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const searchInternational = () => {
    if (selectedRecruitRole) {
      playRecruitSound();
      setIsInternationalRecruiting(true);
      safeSend({ 
        type: 'SEARCH_INTERNATIONAL', 
        role: selectedRecruitRole, 
        seniority: selectedRecruitSeniority 
      });
      setTimeout(() => setIsInternationalRecruiting(false), 1500);
    }
  };

  const [isWeekChanging, setIsWeekChanging] = useState(false);

  const advanceWeek = () => {
    setIsWeekChanging(true);
    safeSend({ type: 'ADVANCE_WEEK' });
    setTimeout(() => setIsWeekChanging(false), 500);
  };

  const [isRecruiting, setIsRecruiting] = useState(false);
  const [isInternationalRecruiting, setIsInternationalRecruiting] = useState(false);

  const playRecruitSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.error("Audio not supported");
    }
  };

  const targetedRecruitment = () => {
    if (selectedRecruitRole) {
      playRecruitSound();
      setIsRecruiting(true);
      safeSend({ 
        type: 'TARGETED_RECRUITMENT', 
        role: selectedRecruitRole,
        seniority: selectedRecruitSeniority
      });
      setTimeout(() => setIsRecruiting(false), 1500);
    }
  };

  const calculateTotalCapacity = (employees: Employee[]) => {
    const SENIORITY_MULTIPLIER = {
      "Sénior": 1.5,
      "Intermédiaire": 1.2,
      "Junior": 1.0,
      "Stagiaire": 0.5
    };
    
    const ABSENTEEISM_RATE = 0.12;
    
    return employees.reduce((acc, emp) => {
      const baseCap = gameState?.roleCapacity[emp.role] || 0;
      return acc + (baseCap * SENIORITY_MULTIPLIER[emp.seniority] * (1 - ABSENTEEISM_RATE));
    }, 0);
  };

  const playSuccessSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      
      const playNote = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      // Happy major arpeggio: C5, E5, G5, C6
      playNote(523.25, now, 0.15);       // C5
      playNote(659.25, now + 0.1, 0.15); // E5
      playNote(783.99, now + 0.2, 0.15); // G5
      playNote(1046.50, now + 0.3, 0.4); // C6
    } catch (e) {
      console.error("Audio not supported");
    }
  };

  const playClickSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.05);
      
      gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      console.error("Audio not supported");
    }
  };

  const applyForContract = (contractId: string) => {
    playSuccessSound();
    safeSend({ type: 'APPLY_CONTRACT', contractId });
  };

  // --- Negotiation Logic ---

  const startNegotiation = (candidate: Employee) => {
    setSelectedCandidate(candidate);
    setOfferedSalary(candidate.minSalary);
    const me = gameState?.players.find(([id]) => id === playerId)?.[1];
    setOfferedBenefits(me?.benefits || []);
    safeSend({ type: "SEND_CANDIDATE_CHAT", candidateId: candidate.id, sender: 'employee', text: `Bonjour ! Je suis intéressé par le poste de ${candidate.role}. Quelle est votre offre ?` });
    setCanAcceptCounter(false);
    setLastCounterOffer(null);
  };

  const sendOffer = async () => {
    if (!selectedCandidate || isWaitingForAI) return;

    setIsWaitingForAI(true);
    const playerMsg = `Je vous propose un salaire de ${offeredSalary.toLocaleString()} $ CAD par mois avec les avantages suivants : ${
      offeredBenefits.map(id => (gameState?.benefits || []).find(b => b.id === id)?.name).filter(Boolean).join(', ') || 'aucun'
    }.`;
    
    const me = gameState?.players.find(([id]) => id === playerId)?.[1];
    safeSend({ type: "SEND_CANDIDATE_CHAT", candidateId: selectedCandidate.id, sender: 'player', text: playerMsg, companyName: me?.companyName });

    try {
      const apiKey = geminiApiKey || (typeof process !== 'undefined' && process.env.GEMINI_API_KEY) || ((import.meta as any).env?.VITE_GEMINI_API_KEY as string);
      if (!apiKey) {
        console.error("Clé API Gemini manquante.");
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
        Tu es un travailleur virtuel en informatique nommé ${selectedCandidate.name}.
        Ton rôle est : ${selectedCandidate.role}.
        Tes attentes minimales sont : ${selectedCandidate.minSalary} $ CAD/mois.
        Tes avantages préférés sont : ${selectedCandidate.preferredBenefits.map(id => (gameState?.benefits || []).find(b => b.id === id)?.name).filter(Boolean).join(', ')}.
        L'employeur te propose : ${offeredSalary} $ CAD/mois et les avantages : ${offeredBenefits.map(id => (gameState?.benefits || []).find(b => b.id === id)?.name).filter(Boolean).join(', ')}.
        
        Réponds à cette offre en français. 
        Si l'offre est excellente (salaire > attentes + avantages préférés présents), accepte avec enthousiasme.
        Si l'offre est insuffisante, fais une contre-proposition réaliste (demande un peu plus de salaire ou un avantage spécifique).
        Si l'offre est insultante (salaire très bas), refuse poliment mais fermement.
        
        Format de réponse JSON :
        {
          "text": "Ton message de réponse",
          "status": "ACCEPTED" | "COUNTER" | "REFUSED",
          "counterSalary": nombre (si COUNTER, le salaire que tu demandes)
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { 
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              status: { type: Type.STRING, enum: ["ACCEPTED", "COUNTER", "REFUSED"] },
              counterSalary: { type: Type.NUMBER }
            },
            required: ["text", "status"]
          }
        }
      });

      const result = parseAIResponse(response.text || "{}");
      safeSend({ type: "SEND_CANDIDATE_CHAT", candidateId: selectedCandidate.id, sender: 'employee', text: result.text });
      
      if (result.status === "ACCEPTED") {
        setNegotiationResult('ACCEPTED');
        setTimeout(() => {
          try {
            finalizeHire(offeredSalary);
            setNegotiationResult(null);
          } catch (err) {
            console.error("Error in negotiation finalization:", err);
          }
        }, 2000);
      } else if (result.status === "REFUSED" || result.status === "REJECTED") {
        setNegotiationResult('REFUSED');
        setTimeout(() => {
          try {
            setSelectedCandidate(null);
            setNegotiationResult(null);
          } catch (err) {
            console.error("Error in negotiation refusal:", err);
          }
        }, 2000);
      } else if (result.status === "COUNTER") {
        setCanAcceptCounter(true);
        setLastCounterOffer({ salary: result.counterSalary });
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      const errorMsg = error?.message?.includes("safety") 
        ? "Désolé, je ne peux pas répondre à cette offre pour des raisons de sécurité."
        : "Désolé, j'ai eu un problème technique en analysant votre offre. Pouvons-nous reprendre ?";
      safeSend({ type: "SEND_CANDIDATE_CHAT", candidateId: selectedCandidate.id, sender: 'employee', text: errorMsg });
    } finally {
      setIsWaitingForAI(false);
    }
  };

  const acceptCounter = () => {
    if (lastCounterOffer) {
      setNegotiationResult('ACCEPTED');
      setTimeout(() => {
        try {
          finalizeHire(lastCounterOffer.salary);
          setSelectedCandidate(null);
          setNegotiationResult(null);
        } catch (err) {
          console.error("Error in counter offer acceptance:", err);
        }
      }, 2000);
    }
  };

  const convinceCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate || !negotiationChatInput.trim() || isWaitingForAI) return;

    const text = negotiationChatInput.trim();
    setNegotiationChatInput("");
    setIsWaitingForAI(true);
    
    const me = gameState?.players.find(([id]) => id === playerId)?.[1];
    safeSend({ type: "SEND_CANDIDATE_CHAT", candidateId: selectedCandidate.id, sender: 'player', text, companyName: me?.companyName });

    try {
      const apiKey = geminiApiKey || (typeof process !== 'undefined' && process.env.GEMINI_API_KEY) || ((import.meta as any).env?.VITE_GEMINI_API_KEY as string);
      if (!apiKey) {
        console.error("Clé API Gemini manquante pour la négociation.");
        safeSend({ type: "SEND_CANDIDATE_CHAT", candidateId: selectedCandidate.id, sender: 'employee', text: "Désolé, je ne peux pas discuter pour le moment (Clé API manquante)." });
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `
        Tu es un travailleur virtuel en informatique nommé ${selectedCandidate.name}.
        Ton rôle est : ${selectedCandidate.role}.
        Tes attentes minimales sont : ${selectedCandidate.minSalary} $ CAD/mois.
        Tes avantages préférés sont : ${selectedCandidate.preferredBenefits.map(id => (gameState?.benefits || []).find(b => b.id === id)?.name).filter(Boolean).join(', ')}.
        
        L'employeur essaie de te convaincre avec ce message : "${text}".
        
        Réponds à ce message en français. 
        Sois réaliste. Si l'employeur est très convaincant, tu peux être plus flexible sur tes demandes.
        Si l'employeur est arrogant ou déconnecté, reste sur tes positions.
        
        Format de réponse JSON :
        {
          "text": "Ton message de réponse",
          "status": "ACCEPTED" | "COUNTER" | "REFUSED" | "STAY",
          "counterSalary": nombre (si COUNTER ou si tu changes tes attentes après avoir été convaincu)
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { 
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              status: { type: Type.STRING, enum: ["ACCEPTED", "COUNTER", "REFUSED", "STAY"] },
              counterSalary: { type: Type.NUMBER }
            },
            required: ["text", "status"]
          }
        }
      });

      const result = parseAIResponse(response.text || "{}");
      safeSend({ type: "SEND_CANDIDATE_CHAT", candidateId: selectedCandidate.id, sender: 'employee', text: result.text });
      
      if (result.status === "ACCEPTED") {
        setNegotiationResult('ACCEPTED');
        setTimeout(() => {
          try {
            finalizeHire(offeredSalary);
            setNegotiationResult(null);
          } catch (err) {
            console.error("Error in conviction acceptance:", err);
          }
        }, 2000);
      } else if (result.status === "REFUSED" || result.status === "REJECTED") {
        setNegotiationResult('REFUSED');
        setTimeout(() => {
          try {
            setSelectedCandidate(null);
            setNegotiationResult(null);
          } catch (err) {
            console.error("Error in conviction refusal:", err);
          }
        }, 2000);
      } else if (result.status === "COUNTER") {
        setCanAcceptCounter(true);
        setLastCounterOffer({ salary: result.counterSalary });
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      const errorMsg = error?.message?.includes("safety") 
        ? "Désolé, je ne peux pas répondre pour des raisons de sécurité."
        : "Désolé, j'ai eu un problème technique en traitant votre message. Pouvons-nous reprendre ?";
      safeSend({ type: "SEND_CANDIDATE_CHAT", candidateId: selectedCandidate.id, sender: 'employee', text: errorMsg });
    } finally {
      setIsWaitingForAI(false);
    }
  };

  const finalizeHire = (salary: number) => {
    if (selectedCandidate) {
      playSuccessSound();
      safeSend({ 
        type: 'NEGOTIATE_RESULT', 
        candidateId: selectedCandidate.id, 
        status: 'ACCEPTED',
        finalSalary: salary
      });
      setSelectedCandidate(null);
    }
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-hec-light flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-2xl max-w-2xl w-full border border-black/5 flex flex-col md:flex-row gap-8"
        >
          <div className="flex-1 space-y-6">
            <h1 className="text-4xl font-black tracking-tighter text-hec-blue leading-none">
              CHASSEUR<br/>
              <span className="text-hec-accent">DE TÊTE</span>
            </h1>
            <p className="text-gray-500 italic">Simulateur d'attractivité et de gestion RH</p>
            
            <div className="space-y-4 pt-4">
              <div className="bg-gray-50 p-4 rounded-2xl border border-black/5">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Règles du jeu</h2>
                <ul className="space-y-3 text-sm">
                  <li className="flex gap-3">
                    <span className="bg-black text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                    <p><strong>Recrutez</strong> : Trouvez les meilleurs talents sur le marché et négociez leur salaire.</p>
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-black text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                    <p><strong>Convainquez</strong> : Utilisez le chat pour persuader les candidats de rejoindre votre équipe.</p>
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-black text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                    <p><strong>Produisez</strong> : Signez des contrats pour générer des revenus grâce à votre équipe.</p>
                  </li>
                  <li className="flex gap-3">
                    <span className="bg-black text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">4</span>
                    <p><strong>Optimisez</strong> : Gérez vos avantages sociaux pour rester attractif sans faire faillite.</p>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="w-full md:w-72 flex flex-col justify-center space-y-6 border-t md:border-t-0 md:border-l border-black/5 pt-6 md:pt-0 md:pl-8">
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Nom de votre entreprise</label>
                <input 
                  type="text" 
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="ex: TechNova Solutions"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition-all font-medium"
                />
              </div>
              <button 
                onClick={joinGame}
                disabled={!companyName.trim()}
                className="w-full bg-black text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-black/10"
              >
                Démarrer l'aventure <TrendingUp className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[10px] text-center text-gray-400 leading-relaxed">
              En démarrant, vous acceptez de relever le défi de la gestion de talents dans un marché compétitif.
            </p>

            <div className="pt-6 border-t border-black/5 mt-6">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Inviter un joueur</label>
              
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`Rejoins ma partie sur Chasseur de tête : ${GAME_URL}`);
                    alert('Lien copié ! Vous pouvez le coller dans votre courriel.');
                  }}
                  className="w-full bg-hec-blue/10 text-hec-blue border border-hec-blue/20 px-4 py-3 rounded-xl font-bold hover:bg-hec-blue/20 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" /> Copier le lien d'invitation
                </button>

                <div className="flex items-center gap-2">
                  <div className="h-px bg-gray-200 flex-1"></div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">OU ENVOYER VIA</span>
                  <div className="h-px bg-gray-200 flex-1"></div>
                </div>

                <form onSubmit={invitePlayer} className="flex flex-col gap-2">
                  <input 
                    type="email" 
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="courriel@exemple.com"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black transition-all text-sm"
                  />
                  <div className="flex gap-2">
                    <button 
                      type="submit"
                      disabled={!inviteEmail.trim()}
                      title="Ouvre votre application de courriel par défaut"
                      className="flex-1 bg-gray-100 text-black px-4 py-2 rounded-xl font-bold hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs whitespace-nowrap flex items-center justify-center gap-2"
                    >
                      <Mail className="w-4 h-4" /> App par défaut
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        if (inviteEmail.trim()) {
                          const subject = encodeURIComponent("Rejoins-moi sur Chasseur de tête !");
                          const body = encodeURIComponent(`Salut !\n\nJe t'invite à jouer à Chasseur de tête avec moi. Rejoins la partie ici : ${GAME_URL}\n\nÀ tout de suite !`);
                          window.open(`https://outlook.office.com/mail/deeplink/compose?to=${inviteEmail.trim()}&subject=${subject}&body=${body}`, '_blank');
                          setInviteEmail('');
                        }
                      }}
                      disabled={!inviteEmail.trim()}
                      title="Ouvrir dans Outlook Web (Office 365)"
                      className="flex-1 bg-[#0078D4] text-white px-4 py-2 rounded-xl font-bold hover:bg-[#006cbd] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs whitespace-nowrap flex items-center justify-center gap-2"
                    >
                      Outlook Web
                    </button>
                  </div>
                </form>
                <p className="text-[10px] text-gray-400 text-center mt-1 leading-tight">
                  Si "App par défaut" ouvre Edge, c'est que Windows est configuré pour utiliser Edge. Utilisez "Copier le lien" pour coller dans votre Outlook de bureau.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const me = gameState?.players.find(([id]) => id === playerId)?.[1];
  const others = gameState?.players.filter(([id]) => id !== playerId).map(([id, p]) => p) || [];

  if (!me) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${theme === 'dark' ? 'bg-hec-blue' : 'bg-hec-light'}`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className={`w-12 h-12 animate-spin ${theme === 'dark' ? 'text-white' : 'text-hec-blue'}`} />
          <p className={`text-sm font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-white/60' : 'text-hec-blue/60'}`}>Initialisation de votre studio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${theme === 'dark' ? 'bg-hec-blue text-white' : 'bg-hec-light text-gray-900'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-md transition-colors duration-300 ${
        theme === 'dark' ? 'bg-hec-blue/80 border-white/10' : 'bg-white/80 border-black/5'
      }`}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shadow-lg transition-colors ${
              theme === 'dark' ? 'bg-white text-black' : 'bg-hec-blue text-white'
            }`}>
              <Zap className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black tracking-tighter uppercase">{me?.companyName || 'Studio Tycoon'}</h1>
              <p className={`text-[8px] md:text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-hec-blue/40'}`}>
                Simulation de Gestion de Studio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-8">
            <button 
              onClick={() => setIsInboxOpen(true)}
              className={`p-2 rounded-xl border transition-all relative ${
                theme === 'dark' ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-black/5 border-black/5 text-black hover:bg-black/10'
              }`}
              title="Boîte de réception"
            >
              <Mail className="w-5 h-5" />
              {me && me.inbox.filter(m => !m.read).length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-black">
                  {me.inbox.filter(m => !m.read).length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={`p-2 rounded-xl border transition-all ${
                theme === 'dark' ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-black/5 border-black/5 text-black hover:bg-black/10'
              }`}
              title={theme === 'light' ? 'Passer au mode sombre' : 'Passer au mode clair'}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            <div className="hidden md:block text-right">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Trésorerie</p>
              <p className={`text-xl font-mono font-bold ${me && me.money < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {(me?.money || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
              </p>
            </div>
            <div className="hidden md:block h-8 w-px bg-black/5"></div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold">{me?.companyName}</p>
                <p className={`text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Semaine {gameState?.currentWeek} / {gameState?.maxWeeks}</p>
              </div>
              <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm md:text-base ${
                theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-gray-100 border-white'
              }`}>
                {me?.companyName?.charAt(0) || 'S'}
              </div>
            </div>
            <button 
              onClick={advanceWeek}
              style={{
                backgroundColor: isWeekChanging ? '#10b981' : `hsl(${((gameState?.currentWeek || 0) * 137.5) % 360}, 70%, 50%)`,
                color: 'white'
              }}
              className={`flex px-4 py-2 md:px-5 md:py-2.5 rounded-xl text-xs md:text-sm font-black transition-all duration-300 items-center gap-2 shadow-lg whitespace-nowrap ${
                isWeekChanging ? 'scale-105' : 'hover:opacity-90'
              }`}
            >
              <Clock className={`w-4 h-4 md:w-5 md:h-5 ${isWeekChanging ? 'animate-spin' : 'animate-pulse'}`} />
              <span className="hidden sm:inline">Semaine Suivante (Semaine {gameState?.currentWeek || 1})</span>
              <span className="sm:hidden">S. {gameState?.currentWeek || 1}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Navigation Tabs */}
        <div className={`flex gap-1 md:gap-2 mb-8 p-1 rounded-2xl w-full md:w-fit overflow-x-auto no-scrollbar transition-colors ${
          theme === 'dark' ? 'bg-white/5' : 'bg-hec-blue/5'
        }`}>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 md:flex-none whitespace-nowrap px-4 md:px-8 py-3 rounded-xl font-bold text-sm md:text-base transition-all flex items-center justify-center gap-2 ${
              activeTab === 'dashboard' 
                ? (theme === 'dark' ? 'bg-white text-black shadow-xl' : 'bg-hec-blue text-white shadow-xl') 
                : (theme === 'dark' ? 'text-gray-500 hover:bg-white/5' : 'text-hec-blue/60 hover:bg-white/80')
            }`}
          >
            <LayoutDashboard className="w-4 h-4 md:w-5 md:h-5" /> <span>Tableau de bord</span>
          </button>
          <button 
            onClick={() => setActiveTab('market')}
            className={`flex-1 md:flex-none whitespace-nowrap px-4 md:px-8 py-3 rounded-xl font-bold text-sm md:text-base transition-all flex items-center justify-center gap-2 relative ${
              activeTab === 'market' 
                ? (theme === 'dark' ? 'bg-white text-black shadow-xl' : 'bg-hec-blue text-white shadow-xl') 
                : (theme === 'dark' ? 'text-gray-500 hover:bg-white/5' : 'text-hec-blue/60 hover:bg-white/80')
            }`}
          >
            <UserPlus className="w-4 h-4 md:w-5 md:h-5" /> <span>Marché de l'emploi</span>
            {gameState?.candidates && gameState.candidates.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-hec-accent text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-black">
                {gameState.candidates.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('competition')}
            className={`flex-1 md:flex-none whitespace-nowrap px-4 md:px-8 py-3 rounded-xl font-bold text-sm md:text-base transition-all flex items-center justify-center gap-2 ${
              activeTab === 'competition' 
                ? (theme === 'dark' ? 'bg-white text-black shadow-xl' : 'bg-hec-blue text-white shadow-xl') 
                : (theme === 'dark' ? 'text-gray-500 hover:bg-white/5' : 'text-hec-blue/60 hover:bg-white/80')
            }`}
          >
            <Trophy className="w-4 h-4 md:w-5 md:h-5" /> <span>Compétition</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Alert Banner */}
              {me && me.weeksAtRisk > 0 && !me.isUnderTutelage && (
                <div className="bg-rose-500 text-white p-6 rounded-3xl flex items-start gap-6 shadow-2xl animate-pulse">
                  <div className="p-3 bg-white/20 rounded-2xl">
                    <TrendingDown className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black uppercase tracking-tighter">Alerte de faillite technique</h4>
                    <p className="text-sm text-white/80 mt-1 max-w-2xl">
                      Votre dette dépasse vos capacités de remboursement. 
                      Vous avez <strong>{6 - me.weeksAtRisk} semaines</strong> pour redresser la situation avant la mise sous tutelle.
                    </p>
                  </div>
                </div>
              )}

              {/* Top Row: Financials & Health */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${
                  theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-white border-black/5'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                      <TrendingUp className="w-6 h-6 text-emerald-500" />
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Revenus</span>
                  </div>
                  <h3 className={`text-xs font-bold uppercase tracking-widest mb-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Mensuels</h3>
                  <p className="text-2xl font-mono font-bold text-emerald-500">
                    {(me?.lastRevenue || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                  </p>
                </div>

                <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${
                  theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-white border-black/5'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-rose-500/10 rounded-xl">
                      <TrendingDown className="w-6 h-6 text-rose-500" />
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Dépenses</span>
                  </div>
                  <h3 className={`text-xs font-bold uppercase tracking-widest mb-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Mensuelles</h3>
                  <p className="text-2xl font-mono font-bold text-rose-500">
                    {(me?.lastExpenses || 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                  </p>
                </div>

                <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${
                  theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-white border-black/5'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-yellow-500/10 rounded-xl">
                      <Star className="w-6 h-6 text-yellow-500" />
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Satisfaction</span>
                  </div>
                  <h3 className={`text-xs font-bold uppercase tracking-widest mb-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Clients</h3>
                  <div className="flex items-end gap-2">
                    <p className="text-2xl font-mono font-bold">{me?.customerSatisfaction || 100}%</p>
                    <div className="flex gap-0.5 mb-1.5">
                      {[...Array(5)].map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-2.5 h-2.5 ${i < Math.round((me?.customerSatisfaction || 100) / 20) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} 
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${
                  theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-white border-black/5'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-pink-500/10 rounded-xl">
                      <Heart className="w-6 h-6 text-pink-500" />
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Rétention</span>
                  </div>
                  <h3 className={`text-xs font-bold uppercase tracking-widest mb-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Équipe</h3>
                  <p className="text-2xl font-mono font-bold">
                    {me?.totalHired ? Math.round((me.employees.length / (me.totalHired || 1)) * 100) : 100}%
                  </p>
                </div>
              </div>

              {/* Main Row: Projects & Capacity */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <GanttChart contracts={me?.activeContracts || []} />
                </div>
                <div className="space-y-6">
                  <div className={`p-6 rounded-3xl border shadow-sm space-y-4 transition-colors ${
                    theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-white border-black/5'
                  }`}>
                    <h3 className={`text-xs font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Utilisation Capacité</h3>
                    <div className="flex justify-between items-center">
                      <span className="text-3xl font-mono font-bold">
                        {Math.floor((me?.activeContracts.reduce((acc, c) => acc + c.requiredCapacity, 0) || 0) / (calculateTotalCapacity(me?.employees || []) || 1) * 100)}%
                      </span>
                      <span className={`text-[10px] font-bold uppercase ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                        {me?.activeContracts.reduce((acc, c) => acc + c.requiredCapacity, 0)} / {Math.floor(calculateTotalCapacity(me?.employees || []))} pts
                      </span>
                    </div>
                    <div className={`h-3 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-white/10' : 'bg-gray-100'}`}>
                      <div 
                        className={`h-full transition-all duration-500 ${theme === 'dark' ? 'bg-white' : 'bg-black'}`} 
                        style={{ width: `${Math.min(100, (me?.activeContracts.reduce((acc, c) => acc + c.requiredCapacity, 0) || 0) / (calculateTotalCapacity(me?.employees || []) || 1) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className={`p-6 rounded-3xl border shadow-sm space-y-4 transition-colors ${
                    theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-white border-black/5'
                  }`}>
                    <h3 className={`text-xs font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Évolution Capacité</h3>
                    <div className="flex items-end gap-1 h-24">
                      {Array.from({ length: 12 }).map((_, weekIdx) => {
                        const weekTotal = me?.employees.reduce((acc, emp) => {
                          const val = emp.productivityHistory?.[emp.productivityHistory.length - 12 + weekIdx];
                          return acc + (val || 0);
                        }, 0) || 0;
                        
                        return (
                          <div 
                            key={weekIdx} 
                            className={`flex-1 rounded-t-lg relative group transition-colors ${theme === 'dark' ? 'bg-white/5' : 'bg-black/5'}`}
                            style={{ height: '100%' }}
                          >
                            <div 
                              className={`absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-500 ${theme === 'dark' ? 'bg-hec-accent' : 'bg-hec-blue'}`}
                              style={{ height: `${Math.min(100, (weekTotal / 500) * 100)}%` }}
                            />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black text-white text-[8px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-xl">
                              {weekTotal.toFixed(0)} pts
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className={`flex justify-between text-[8px] font-bold uppercase ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      <span>Sem -12</span>
                      <span>Aujourd'hui</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Team & Benefits */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className={`lg:col-span-2 rounded-3xl border shadow-sm overflow-hidden transition-colors ${
                  theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-white border-black/5'
                }`}>
                  <div className={`p-6 border-b flex items-center justify-between ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Users className="w-5 h-5" /> Votre Équipe ({me?.employees.length})
                    </h3>
                  </div>
                  <div className={`divide-y ${theme === 'dark' ? 'divide-white/10' : 'divide-black/5'}`}>
                    {me?.employees.length === 0 ? (
                      <div className="p-12 text-center text-gray-400 italic">
                        Aucun employé pour le moment. Allez sur le marché pour recruter !
                      </div>
                    ) : (
                      me?.employees.map(emp => {
                        const isNewHire = emp.hiredAtWeek === gameState?.currentWeek;
                        return (
                        <div key={emp.id} className={`p-4 flex items-center justify-between transition-colors ${
                          isNewHire
                            ? (theme === 'dark' ? 'bg-emerald-500/10 border-l-4 border-emerald-500' : 'bg-emerald-50 border-l-4 border-emerald-500')
                            : (theme === 'dark' ? 'hover:bg-white/5 border-l-4 border-transparent' : 'hover:bg-gray-50 border-l-4 border-transparent')
                        }`}>
                          <div className="flex items-center gap-4">
                            <img 
                              src={emp.avatarUrl} 
                              alt={emp.name} 
                              className={`w-12 h-12 rounded-2xl object-cover border ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold">{emp.name} {emp.isInternational && "🌍"}</p>
                                {isNewHire && (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase rounded-full border border-emerald-200 animate-pulse">
                                    Nouveau
                                  </span>
                                )}
                                {emp.resignationNotice !== null && (
                                  <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] font-black uppercase rounded-full border border-rose-200 animate-pulse">
                                    Démission (Préavis)
                                  </span>
                                )}
                              </div>
                              <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                {emp.role} • <span className={
                                  emp.seniority === 'Sénior' ? 'text-indigo-400 font-bold' : 
                                  emp.seniority === 'Intermédiaire' ? 'text-blue-400 font-bold' :
                                  emp.seniority === 'Stagiaire' ? 'text-amber-400 font-bold' : 
                                  'text-gray-400'
                                }>
                                  {emp.seniority}
                                </span>
                              </p>
                              <div className="mt-2 flex items-center gap-3">
                                <div className="px-2 py-0.5 bg-hec-blue text-white rounded-md flex items-center gap-1.5 shadow-sm">
                                  <TrendingUp className="w-3 h-3" />
                                  <span className="text-[10px] font-black uppercase tracking-wider">
                                    {emp.productivityHistory?.length ? emp.productivityHistory[emp.productivityHistory.length - 1].toFixed(0) : 0} PTS/SEM
                                  </span>
                                </div>
                                <div className="flex gap-0.5 h-4 items-end pb-0.5">
                                  {(emp.productivityHistory || []).slice(-10).map((val, i) => (
                                    <div 
                                      key={i} 
                                      className="w-1 bg-indigo-400/30 rounded-t-sm" 
                                      style={{ height: `${Math.max(20, (val / 150) * 100)}%` }}
                                      title={`Semaine ${i + 1}: ${val} pts`}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-8">
                            <div className="text-right">
                              <p className={`text-[10px] font-bold uppercase tracking-tighter ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Coût Mensuel</p>
                              <p className="font-mono font-bold">
                                {((emp.minSalary + (me?.benefits.reduce((acc, bId) => acc + (gameState?.benefits.find(b => b.id === bId)?.costPerEmployee || 0), 0) || 0)) * (emp.isInternational ? 2 : 1)).toLocaleString('fr-CA')} $
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setActiveChatEmployeeId(emp.id)}
                                className={`p-2 transition-colors ${theme === 'dark' ? 'text-gray-500 hover:text-white' : 'text-gray-300 hover:text-hec-blue'}`}
                                title="Discuter"
                              >
                                <MessageSquare className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => fireEmployee(emp.id)}
                                className={`p-2 transition-colors ${theme === 'dark' ? 'text-gray-500 hover:text-rose-400' : 'text-gray-400 hover:text-rose-600'}`}
                                title="Licencier"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className={`p-6 rounded-3xl border shadow-sm h-fit transition-colors ${
                  theme === 'dark' ? 'bg-hec-light/20 border-white/10' : 'bg-white border-black/5'
                }`}>
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                    <Settings className="w-5 h-5" /> Avantages Sociaux
                  </h3>
                  <div className="space-y-3">
                    {gameState?.benefits.map(benefit => {
                      const isActive = me?.benefits.includes(benefit.id);
                      const isPremium = benefit.id === 'pension' || benefit.id === 'dental';
                      return (
                        <button 
                          key={benefit.id}
                          onClick={() => toggleBenefit(benefit.id)}
                          className={`w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between group relative overflow-hidden ${
                            isActive 
                              ? (theme === 'dark' ? 'border-white bg-white text-black' : 'border-black bg-black text-white')
                              : (isPremium 
                                  ? (theme === 'dark' ? 'border-amber-500/50 bg-amber-500/10 hover:border-amber-500' : 'border-amber-400 bg-amber-50 hover:border-amber-500')
                                  : (theme === 'dark' ? 'border-white/10 bg-white/5 hover:border-white/30' : 'border-gray-100 bg-gray-50 hover:border-gray-300'))
                          }`}
                        >
                          {isPremium && !isActive && (
                            <div className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-bl-lg">PREMIUM</div>
                          )}
                          <div>
                            <p className={`font-bold text-sm ${isPremium && !isActive ? 'text-amber-600 dark:text-amber-400' : ''}`}>{benefit.name}</p>
                            <p className={`text-[10px] uppercase tracking-widest ${isActive ? (theme === 'dark' ? 'text-gray-600' : 'text-gray-400') : 'text-gray-500'}`}>
                              +{benefit.attractiveness} Attractivité
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-[10px] font-bold ${isActive ? (theme === 'dark' ? 'text-gray-600' : 'text-gray-400') : 'text-gray-500'}`}>Coût/Emp</p>
                            <p className={`font-mono text-xs ${isPremium && !isActive ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}`}>{benefit.costPerEmployee} $</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'market' && (
            <motion.div 
              key="market"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Market Header with Capacity */}
              <div className={`p-8 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl transition-colors ${
                theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'
              }`}>
                <div>
                  <h2 className="text-3xl font-bold tracking-tighter mb-2">Marché de l'Emploi</h2>
                  <p className="text-gray-400 text-sm">Trouvez les meilleurs talents et les contrats les plus lucratifs.</p>
                </div>
                <div className="flex gap-8">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Capacité Actuelle</p>
                    <p className="text-3xl font-mono font-bold text-indigo-400">
                      {Math.floor(calculateTotalCapacity(me?.employees || []))} <span className="text-xs">PTS</span>
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Charge de Travail</p>
                    <p className="text-3xl font-mono font-bold text-emerald-400">
                      {me?.activeContracts.reduce((acc, c) => acc + c.requiredCapacity, 0)} <span className="text-xs">PTS</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Contracts Section */}
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Briefcase className="w-6 h-6" /> Contrats Disponibles
                  </h2>
                  <span className="text-xs font-bold text-gray-500 bg-white px-3 py-1 rounded-full border border-black/5">
                    {gameState?.availableContracts.length} Offres
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-3">
                  {gameState?.availableContracts.map(contract => {
                    const currentCapacity = calculateTotalCapacity(me?.employees || []);
                    const usedCapacity = me?.activeContracts.reduce((acc, c) => acc + c.requiredCapacity, 0) || 0;
                    const availableCapacity = currentCapacity - usedCapacity;
                    const playerRoles = new Set(me?.employees.map(e => e.role) || []);
                    const hasRequiredRoles = contract.requiredRoles.every(role => playerRoles.has(role));
                    const canApply = availableCapacity >= contract.requiredCapacity && hasRequiredRoles && !me?.isUnderTutelage;
                    const isExpanded = expandedContractId === contract.id;

                    return (
                      <div 
                        key={contract.id} 
                        className="relative group"
                        onMouseEnter={() => setExpandedContractId(contract.id)}
                        onMouseLeave={() => setExpandedContractId(null)}
                      >
                        {/* Pill */}
                        <div 
                          onClick={() => {
                            if (canApply && !isExpanded) playClickSound();
                            setExpandedContractId(isExpanded ? null : contract.id);
                          }}
                          className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2 rounded-full border cursor-pointer transition-all ${
                            canApply 
                              ? (theme === 'dark' ? 'bg-hec-accent/20 border-hec-accent/50 hover:bg-hec-accent/30' : 'bg-hec-blue/10 border-hec-blue/20 hover:bg-hec-blue/20 shadow-md')
                              : (theme === 'dark' ? 'bg-hec-light/10 border-white/10 hover:bg-hec-light/20' : 'bg-white border-black/10 hover:bg-gray-50 shadow-sm')
                          }`}
                        >
                          <Briefcase className={`transition-all ${canApply ? 'w-5 h-5 sm:w-6 sm:h-6 text-hec-blue animate-pulse' : 'w-4 h-4 text-hec-accent'}`} />
                          <span className={`font-bold text-xs sm:text-sm truncate max-w-[120px] sm:max-w-[200px] ${canApply ? 'text-indigo-900 dark:text-indigo-200' : ''}`}>{contract.title}</span>
                          <span className="text-emerald-600 font-bold text-[10px] sm:text-xs">+{contract.monthlyRevenue.toLocaleString()}$</span>
                        </div>

                        {/* Tooltip / Dropdown */}
                        <div className={`absolute top-full left-0 sm:left-1/2 sm:-translate-x-1/2 mt-2 w-64 sm:w-72 p-4 rounded-2xl shadow-xl border transition-all z-50 ${
                          isExpanded ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2'
                        } ${
                          theme === 'dark' ? 'bg-gray-900 border-white/10 text-white' : 'bg-white border-black/10 text-black'
                        }`}>
                          <h4 className="text-sm sm:text-base font-bold mb-3">{contract.title}</h4>
                          <div className="space-y-2 mb-4">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Workload</span>
                              <span className="font-bold">{contract.workload.toLocaleString()} pts</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Capacité requise</span>
                              <span className={`font-bold ${availableCapacity < contract.requiredCapacity ? 'text-rose-500' : ''}`}>
                                {contract.requiredCapacity} pts
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Délai</span>
                              <span className="font-bold">{contract.duration} sem.</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Amende</span>
                              <span className="font-bold text-rose-500">-{contract.penalty.toLocaleString()}$</span>
                            </div>
                            <div className="mt-2">
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Fonctions requises</p>
                              <div className="flex flex-wrap gap-1">
                                {contract.requiredRoles.map(role => (
                                  <span 
                                    key={role} 
                                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                                      playerRoles.has(role) 
                                        ? (theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
                                        : (theme === 'dark' ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-100 text-rose-700')
                                    }`}
                                  >
                                    {role}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); applyForContract(contract.id); setExpandedContractId(null); }}
                            disabled={!canApply}
                            className="w-full py-2 rounded-xl bg-hec-blue text-white text-xs font-bold hover:bg-hec-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {me?.isUnderTutelage 
                              ? 'Sous Tutelle' 
                              : !hasRequiredRoles 
                                ? 'Fonctions manquantes' 
                                : availableCapacity < contract.requiredCapacity 
                                  ? 'Capacité insuffisante' 
                                  : 'Postuler'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Candidates Section */}
              <div className="space-y-8">
                {/* HR Service Header */}
                <div className={`p-8 rounded-[40px] border transition-all ${
                  theme === 'dark' ? 'bg-hec-light border-hec-blue/20 text-hec-blue' : 'bg-white border-black/5 shadow-sm'
                }`}>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-2xl ${theme === 'dark' ? 'bg-hec-blue/10 text-hec-blue' : 'bg-hec-blue/10 text-hec-blue'}`}>
                          <UserPlus className="w-6 h-6" />
                        </div>
                        <h2 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">
                          Service de RH
                        </h2>
                      </div>
                      <p className={`text-sm font-medium ${theme === 'dark' ? 'text-hec-blue/60' : 'text-gray-400'}`}>
                        Gérez vos recrutements et attirez les meilleurs talents pour votre entreprise.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                      <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-2xl border transition-all ${
                        theme === 'dark' ? 'bg-hec-light border-hec-blue/10' : 'bg-gray-50 border-black/5'
                      }`}>
                        <div className="flex items-center gap-2 border-b sm:border-b-0 sm:border-r border-black/5 pb-2 sm:pb-0 px-2">
                          <select 
                            value={selectedRecruitRole} 
                            onChange={(e) => setSelectedRecruitRole(e.target.value as Role)}
                            className={`bg-transparent text-sm font-bold outline-none py-1 min-w-[140px] ${theme === 'dark' ? 'text-hec-blue' : 'text-black'}`}
                          >
                            {roles.map(role => <option key={role} value={role} className={theme === 'dark' ? 'bg-hec-light' : ''}>{role}</option>)}
                          </select>
                          <div className="w-px h-4 bg-black/10 hidden sm:block" />
                          <select 
                            value={selectedRecruitSeniority} 
                            onChange={(e) => setSelectedRecruitSeniority(e.target.value as any)}
                            className={`bg-transparent text-sm font-bold outline-none py-1 min-w-[100px] ${theme === 'dark' ? 'text-hec-blue' : 'text-black'}`}
                          >
                            <option value="Stagiaire" className={theme === 'dark' ? 'bg-hec-light' : ''}>Stagiaire</option>
                            <option value="Junior" className={theme === 'dark' ? 'bg-hec-light' : ''}>Junior</option>
                            <option value="Intermédiaire" className={theme === 'dark' ? 'bg-hec-light' : ''}>Intermédiaire</option>
                            <option value="Sénior" className={theme === 'dark' ? 'bg-hec-light' : ''}>Sénior</option>
                          </select>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                          <button 
                            onClick={targetedRecruitment}
                            disabled={me?.isUnderTutelage || isRecruiting}
                            className={`px-6 py-3 rounded-xl text-sm font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg flex-1 ${
                              isRecruiting 
                                ? 'bg-emerald-500 text-white'
                                : me && me.targetedRecruitCount >= 2 
                                  ? 'bg-amber-400 hover:bg-amber-500 text-amber-950' 
                                  : 'bg-hec-blue hover:bg-hec-accent text-white'
                            }`}
                          >
                            {isRecruiting ? (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                Candidat trouvé !
                              </>
                            ) : (
                              <>
                                <Search className="w-4 h-4" />
                                Local ({me && me.targetedRecruitCount < 2 ? 'Gratuit' : '5 000 $'})
                              </>
                            )}
                          </button>

                          <button 
                            onClick={searchInternational}
                            disabled={me?.isUnderTutelage || isInternationalRecruiting}
                            className={`px-6 py-3 rounded-xl text-sm font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg flex-1 ${
                              isInternationalRecruiting 
                                ? 'bg-emerald-500 text-white'
                                : me && me.targetedInternationalCount >= 2 
                                  ? 'bg-amber-400 hover:bg-amber-500 text-amber-950' 
                                  : 'bg-hec-blue hover:bg-hec-accent text-white'
                            }`}
                          >
                            {isInternationalRecruiting ? (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                Candidat trouvé !
                              </>
                            ) : (
                              <>
                                <span className="text-lg">🌍</span>
                                Intl ({me && me.targetedInternationalCount < 2 ? 'Gratuit' : '5 000 $'})
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 px-4">
                  <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                    Marché Local
                  </h3>
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${
                    theme === 'dark' ? 'bg-white/5 border-white/10 text-gray-400' : 'bg-white border-black/5 text-gray-500'
                  }`}>
                    {gameState?.candidates.filter(c => !c.isInternational).length} Candidats Disponibles
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...(gameState?.candidates || [])]
                    .sort((a, b) => (b.isInternational ? 1 : 0) - (a.isInternational ? 1 : 0))
                    .map(candidate => (
                    <motion.div 
                      layout
                      key={candidate.id}
                      className={`p-6 rounded-[40px] border transition-all flex flex-col justify-between group relative overflow-hidden ${
                        theme === 'dark' 
                          ? 'bg-[#333333] border-white/5 hover:border-white/10' 
                          : 'bg-white border-black/5 shadow-sm hover:shadow-md'
                      } ${candidate.isInternational ? 'ring-4 ring-hec-blue border-hec-blue' : ''}`}
                    >
                      {(candidate.isInternational || candidate.isTargeted) && (
                        <div className={`text-white text-[10px] font-black uppercase tracking-widest text-center -mx-6 -mt-6 mb-6 flex shadow-sm`}>
                          {candidate.isInternational && (
                            <div className={`flex-1 py-1 bg-sky-400`}>
                              International
                            </div>
                          )}
                          {candidate.isTargeted && (
                            <div className={`flex-1 py-1 bg-emerald-500`}>
                              Négocié
                            </div>
                          )}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-6">
                          <div className="relative">
                            <img 
                              src={candidate.avatarUrl} 
                              alt={candidate.name} 
                              className={`w-16 h-16 rounded-2xl object-cover border-2 shadow-lg transition-transform group-hover:scale-105 ${theme === 'dark' ? 'border-white/10' : 'border-white'}`}
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="text-right">
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>Attente Salariale</p>
                            <p className={`font-mono font-black text-xl ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                              {candidate.minSalary.toLocaleString('fr-CA')} $
                            </p>
                            {candidate.isInternational && <span className="text-[10px] text-hec-accent font-bold block">Coût X2</span>}
                          </div>
                        </div>
                        <h4 className={`text-xl font-black mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{candidate.name}</h4>
                        <p className={`text-sm mb-4 font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-400'}`}>{candidate.role}</p>
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider border ${
                            candidate.seniority === 'Sénior' ? (theme === 'dark' ? 'bg-white text-black border-white' : 'bg-hec-blue/10 text-hec-blue border-hec-blue/10') : 
                            candidate.seniority === 'Intermédiaire' ? (theme === 'dark' ? 'bg-blue-500 text-white border-blue-500' : 'bg-blue-50 text-blue-700 border-blue-100') :
                            candidate.seniority === 'Stagiaire' ? (theme === 'dark' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-100') :
                            (theme === 'dark' ? 'bg-white text-black border-white' : 'bg-gray-100 text-gray-600 border-gray-200')
                          }`}>
                            {candidate.seniority}
                          </span>
                          <div className={`px-3 py-1 rounded-full flex items-center gap-1 border transition-colors ${
                            theme === 'dark' ? 'bg-white border-white text-black' : 'bg-hec-blue/10 border-hec-blue/10 text-hec-blue'
                          }`}>
                            <TrendingUp className="w-3 h-3" />
                            <span className="text-[10px] font-black uppercase tracking-wider">
                              +{Math.floor((candidate.seniority === "Stagiaire" ? (gameState.roleCapacity[candidate.role] * 0.5) : gameState.roleCapacity[candidate.role]) * 0.88)} PTS
                            </span>
                          </div>
                        </div>
                        
                        <div className="mb-6">
                          <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-400'}`}>Préférences</p>
                          <div className="flex flex-wrap gap-2">
                            {candidate.preferredBenefits.map(bId => {
                              const benefit = gameState.benefits.find(b => b.id === bId);
                              const isOffered = me?.benefits.includes(bId);
                              return (
                                <span 
                                  key={bId} 
                                  className={`text-[10px] px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 ${
                                    theme === 'dark' 
                                      ? 'bg-white text-gray-600' 
                                      : (isOffered ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')
                                  }`}
                                >
                                  {isOffered && theme !== 'dark' && <CheckCircle2 className="w-3 h-3" />}
                                  {benefit?.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => startNegotiation(candidate)}
                        disabled={me?.isUnderTutelage}
                        className={`w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-3 shadow-lg disabled:opacity-50 ${
                          theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'
                        }`}
                      >
                        Négocier l'offre <MessageSquare className="w-5 h-5" />
                      </button>
                    </motion.div>
                  ))}
                </div>

                {(() => {
                  const ghosts = gameState?.players.flatMap(([id, p]) => 
                    p.employees.filter(e => e.isLookingForJob).map(e => ({ ...e, companyName: p.companyName, companyId: id }))
                  ) || [];
                  return (
                    <div className="mt-12">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-black flex items-center gap-2 text-purple-500">
                          <Ghost className="w-6 h-6" /> Talents à l'écoute du marché (Mode GHOST)
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${theme === 'dark' ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                          {ghosts.length} Employés insatisfaits
                        </span>
                      </div>
                      {ghosts.length === 0 ? (
                        <div className={`p-8 rounded-[32px] border text-center ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-black/5'}`}>
                          <p className={`text-sm font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Aucun talent n'est actuellement à l'écoute du marché.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {ghosts.map(ghost => {
                            const isOwned = ghost.companyId === playerId;
                            const lastMsgWithCompany = ghost.chatHistory ? [...ghost.chatHistory].reverse().find(msg => msg.companyName) : null;
                            const isNegotiatedByOther = lastMsgWithCompany && lastMsgWithCompany.companyName !== ghost.companyName;

                            return (
                              <motion.div 
                                layout
                                key={ghost.id}
                                className={`p-6 rounded-[40px] border transition-all flex flex-col justify-between group relative overflow-hidden ${
                                  theme === 'dark' 
                                    ? 'bg-[#333333] border-white/5 hover:border-white/10' 
                                    : 'bg-purple-50 border-purple-200 shadow-sm hover:shadow-md'
                                }`}
                              >
                                {isOwned && (
                                  <div className={`absolute inset-0 backdrop-blur-md z-10 pointer-events-none ${theme === 'dark' ? 'bg-black/40' : 'bg-white/60'}`}></div>
                                )}
                                <div className="bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest text-center py-1 -mx-6 -mt-6 mb-6 rounded-t-[32px] relative z-20">
                                  Mode Ghost
                                  <div className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[9px] ${isOwned ? 'bg-white/10 backdrop-blur-md text-white/70' : 'bg-white/20'}`}>
                                    {ghost.companyName}
                                  </div>
                                </div>
                                <div className="relative z-0">
                                  <div className="flex items-center justify-between mb-6">
                                    <div className="relative">
                                      <img 
                                        src={ghost.avatarUrl} 
                                        alt={ghost.name} 
                                        className={`w-16 h-16 rounded-2xl object-cover border-2 shadow-lg transition-transform group-hover:scale-105 ${theme === 'dark' ? 'border-purple-500/30' : 'border-purple-200'} ${isOwned ? 'blur-sm opacity-60' : ''}`}
                                        referrerPolicy="no-referrer"
                                      />
                                      {isNegotiatedByOther && (
                                        <div className="absolute -bottom-2 -right-2 bg-amber-500 text-white text-[8px] font-black px-2 py-1 rounded-full shadow-lg animate-pulse whitespace-nowrap z-20">
                                          Négociation en cours
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>Attente Salariale</p>
                                      <p className={`font-mono font-black text-xl ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                                        {ghost.minSalary.toLocaleString('fr-CA')} $
                                      </p>
                                    </div>
                                  </div>
                                  <h4 className={`text-xl font-black mb-1 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{ghost.name}</h4>
                                  <p className={`text-sm mb-4 font-bold ${theme === 'dark' ? 'text-gray-400' : 'text-purple-600'}`}>{ghost.role}</p>
                                  <div className="flex flex-wrap items-center gap-2 mb-4">
                                    <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider border ${
                                      theme === 'dark' ? 'bg-white text-black border-white' : 'bg-purple-100 text-purple-700 border-purple-200'
                                    }`}>
                                      {ghost.seniority}
                                    </span>
                                  </div>
                                  <div className={`p-3 rounded-xl text-xs font-medium italic mb-6 ${theme === 'dark' ? 'bg-white/10 text-white' : 'bg-white/60 text-gray-600'}`}>
                                    "Je cherche une entreprise qui offre de meilleures conditions et avantages sociaux."
                                  </div>
                                </div>
                                <button 
                                  onClick={() => startNegotiation(ghost)}
                                  disabled={me?.isUnderTutelage || ghost.companyId === playerId}
                                  className={`w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-3 shadow-lg relative z-20 ${
                                    theme === 'dark' 
                                      ? 'bg-white text-black hover:bg-gray-200' 
                                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                                  } disabled:opacity-50`}
                                >
                                  {ghost.companyId === playerId ? "C'est votre employé" : "Négocier l'offre"} <MessageSquare className="w-5 h-5" />
                                </button>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {activeTab === 'competition' && (
            <motion.div 
              key="competition"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white rounded-[32px] border border-black/5 shadow-sm overflow-hidden"
            >
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-black/5">
                      <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-400">Entreprise</th>
                      <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-400">Trésorerie</th>
                      <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-400">Effectif</th>
                      <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-400">Avantages</th>
                      <th className="p-6 text-xs font-bold uppercase tracking-widest text-gray-400">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {[me, ...others].filter(Boolean).map((p, idx) => (
                      <tr key={p!.id} className={p!.id === playerId ? 'bg-emerald-50/30' : ''}>
                        <td className="p-6">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-gray-300 font-bold">0{idx + 1}</span>
                            <span className="font-bold">{p!.companyName}</span>
                            {p!.id === playerId && <span className="text-[10px] bg-black text-white px-2 py-0.5 rounded-full uppercase font-bold">Vous</span>}
                          </div>
                        </td>
                        <td className="p-6 font-mono font-bold text-emerald-600">
                          {p!.money.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                        </td>
                        <td className="p-6">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-400" />
                            <span className="font-bold">{p!.employees.length}</span>
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="flex -space-x-2">
                            {p!.benefits.map(bId => (
                              <div key={bId} className="w-6 h-6 rounded-full bg-black border-2 border-white flex items-center justify-center text-[8px] text-white font-bold" title={gameState?.benefits.find(b => b.id === bId)?.name}>
                                {gameState?.benefits.find(b => b.id === bId)?.name.charAt(0)}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-6">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${p!.lastRevenue > p!.lastExpenses ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {p!.lastRevenue > p!.lastExpenses ? 'Rentable' : 'Déficitaire'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-black/5">
                {[me, ...others].filter(Boolean).map((p, idx) => (
                  <div key={p!.id} className={`p-4 ${p!.id === playerId ? 'bg-emerald-50/30' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-gray-300 font-bold">0{idx + 1}</span>
                        <span className="font-bold text-sm">{p!.companyName}</span>
                        {p!.id === playerId && <span className="text-[8px] bg-black text-white px-2 py-0.5 rounded-full uppercase font-bold">Vous</span>}
                      </div>
                      <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase ${p!.lastRevenue > p!.lastExpenses ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {p!.lastRevenue > p!.lastExpenses ? 'Rentable' : 'Déficitaire'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase text-gray-400 font-bold">Trésorerie</span>
                        <span className="text-xs font-mono font-bold text-emerald-600">{p!.money.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase text-gray-400 font-bold">Effectif</span>
                        <div className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-gray-400" />
                          <span className="text-xs font-bold">{p!.employees.length}</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase text-gray-400 font-bold">Avantages</span>
                        <div className="flex -space-x-1 mt-0.5">
                          {p!.benefits.map(bId => (
                            <div key={bId} className="w-4 h-4 rounded-full bg-black border border-white flex items-center justify-center text-[6px] text-white font-bold">
                              {gameState?.benefits.find(b => b.id === bId)?.name.charAt(0)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Inbox Overlay */}
      <AnimatePresence>
        {isInboxOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] ${
                theme === 'dark' ? 'bg-[#111] text-white' : 'bg-white text-black'
              }`}
            >
              <div className={`p-6 border-b flex items-center justify-between ${theme === 'dark' ? 'border-white/10' : 'border-black/5'}`}>
                <div className="flex items-center gap-3">
                  <Mail className="w-6 h-6 text-hec-accent" />
                  <h2 className="text-xl font-black uppercase tracking-tight">Boîte de réception</h2>
                </div>
                <button 
                  onClick={() => setIsInboxOpen(false)}
                  className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {me?.inbox.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 italic">
                    Aucun message pour le moment.
                  </div>
                ) : (
                  [...(me?.inbox || [])].reverse().map(msg => (
                    <div 
                      key={msg.id} 
                      className={`p-4 rounded-2xl border transition-all ${
                        !msg.read 
                          ? (theme === 'dark' ? 'bg-hec-accent/10 border-hec-accent/30' : 'bg-hec-blue/10 border-hec-blue/20') 
                          : (theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-black/5')
                      }`}
                      onClick={() => {
                        if (!msg.read) {
                          safeSend({ type: 'MARK_MESSAGE_READ', messageId: msg.id });
                        }
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-sm">{msg.subject}</h3>
                          <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>De: {msg.from} • Semaine {msg.week}</p>
                        </div>
                        {!msg.read && <span className="w-2 h-2 rounded-full bg-hec-accent"></span>}
                      </div>
                      <p className="text-sm mt-2 whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resignation Overlay */}
      <AnimatePresence>
        {resignedEmployee && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4"
          >
            <motion.div 
              initial={{ scale: 0.5, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="bg-white p-8 md:p-16 rounded-[40px] shadow-2xl flex flex-col items-center gap-8 border border-white/20 w-full max-w-md text-center"
            >
              <motion.div
                animate={{ 
                  y: [0, -20, 0],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="relative"
              >
                <img 
                  src={resignedEmployee.avatarUrl} 
                  alt={resignedEmployee.name}
                  className="w-32 h-32 md:w-48 md:h-48 rounded-[40px] object-cover border-4 border-rose-500 shadow-2xl"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute -bottom-4 -right-4 bg-rose-600 text-white p-4 rounded-2xl shadow-xl">
                  <TrendingDown className="w-8 h-8" />
                </div>
              </motion.div>
              
              <div className="space-y-2">
                <h2 className="text-3xl md:text-5xl font-black text-rose-600 uppercase tracking-tighter italic">Démission !</h2>
                <p className="text-lg font-bold text-gray-900">{resignedEmployee.name} a quitté l'entreprise.</p>
                <p className="text-sm text-gray-500 font-medium">
                  {resignedEmployee.role} • {resignedEmployee.seniority}
                </p>
              </div>

              <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100 w-full">
                <p className="text-xs text-rose-700 font-bold uppercase tracking-widest mb-2">Motif probable</p>
                <p className="text-sm text-rose-900 italic">
                  "Les conditions de travail ne me conviennent plus. Je cherche de nouveaux défis ailleurs."
                </p>
              </div>

              <button 
                onClick={() => setResignedEmployee(null)}
                className="w-full py-4 bg-black text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-xl"
              >
                Continuer
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Negotiation Result Overlay */}
      <AnimatePresence>
        {negotiationResult && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          >
            <motion.div 
              initial={{ scale: 0.5, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="bg-white p-8 md:p-16 rounded-[32px] md:rounded-[40px] shadow-2xl flex flex-col items-center gap-4 md:gap-8 border border-white/20 w-full max-w-md"
            >
              {negotiationResult === 'ACCEPTED' ? (
                <>
                  <motion.div
                    animate={{ 
                      rotate: [0, -10, 10, -10, 10, 0],
                      scale: [1, 1.1, 1, 1.1, 1]
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Handshake className="text-hec-blue w-24 h-24 md:w-40 md:h-40" />
                  </motion.div>
                  <div className="text-center">
                    <h2 className="text-2xl md:text-4xl font-black text-hec-blue uppercase tracking-tighter italic">Contrat Signé !</h2>
                    <p className="text-xs md:text-sm text-gray-500 font-medium mt-1 md:mt-2">Bienvenue dans l'équipe.</p>
                  </div>
                </>
              ) : (
                <>
                  <motion.div
                    animate={{ 
                      scale: [1, 1.2, 1],
                      rotate: [0, 10, -10, 10, -10, 0]
                    }}
                    transition={{ duration: 0.5 }}
                  >
                    <XCircle className="text-rose-600 w-24 h-24 md:w-40 md:h-40" />
                  </motion.div>
                  <div className="text-center">
                    <h2 className="text-2xl md:text-4xl font-black text-rose-600 uppercase tracking-tighter italic">Offre Refusée</h2>
                    <p className="text-xs md:text-sm text-gray-500 font-medium mt-1 md:mt-2">Le candidat a quitté la table.</p>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Negotiation Modal */}
      <AnimatePresence>
        {selectedCandidate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`rounded-[32px] md:rounded-[40px] shadow-2xl max-w-5xl w-full h-[95vh] md:h-[90vh] flex flex-col md:flex-row overflow-hidden border transition-colors ${
                theme === 'dark' ? 'bg-hec-blue border-white/10' : 'bg-white border-black/5'
              }`}
            >
              {/* Left: Chat */}
              <div className={`flex-[1.2] md:flex-1 flex flex-col border-b md:border-b-0 md:border-r transition-colors min-h-0 ${
                theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-black/5'
              }`}>
                <div className={`p-4 md:p-6 border-b flex items-center justify-between transition-colors ${
                  theme === 'dark' ? 'bg-black/20 border-white/10' : 'bg-white border-black/5'
                }`}>
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center transition-colors ${
                      theme === 'dark' ? 'bg-white text-black' : 'bg-black text-white'
                    }`}>
                      <MessageSquare className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <div>
                      <h3 className="text-base md:text-lg font-bold">{selectedCandidate.name}</h3>
                      <p className={`text-[10px] md:text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{selectedCandidate.role}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedCandidate(null)} className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
                    <XCircle className="w-6 h-6 text-gray-400" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-6">
                  {(gameState?.candidates.find(c => c.id === selectedCandidate.id)?.chatHistory || []).map((msg, idx) => (
                    msg.sender === 'system' ? (
                      <div key={idx} className="text-center text-xs text-gray-500 italic my-2">{msg.text}</div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={idx} 
                        className={`flex ${msg.sender === 'player' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[85%] md:max-w-[80%] p-3 md:p-4 rounded-2xl md:rounded-3xl text-xs md:text-sm shadow-sm ${
                          msg.sender === 'player' 
                            ? (theme === 'dark' ? 'bg-white text-black rounded-tr-none' : 'bg-black text-white rounded-tr-none') 
                            : (theme === 'dark' ? 'bg-white/10 border border-white/10 text-white rounded-tl-none' : 'bg-white border border-black/5 rounded-tl-none')
                        }`}>
                          {msg.sender === 'player' && msg.companyName && <div className="text-[10px] opacity-75 mb-1 font-bold">{msg.companyName}</div>}
                          {msg.text}
                        </div>
                      </motion.div>
                    )
                  ))}
                  {isWaitingForAI && (
                    <div className="flex justify-start">
                      <div className={`p-3 md:p-4 rounded-2xl md:rounded-3xl rounded-tl-none flex items-center gap-3 border transition-colors ${
                        theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-black/5 shadow-sm'
                      }`}>
                        <Loader2 className="w-4 h-4 animate-spin text-hec-accent" />
                        <span className={`text-[10px] md:text-xs italic ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>En train de réfléchir...</span>
                      </div>
                    </div>
                  )}
                </div>

                {canAcceptCounter && (
                  <div className={`p-3 md:p-4 border-t flex items-center justify-between gap-4 transition-colors ${
                    theme === 'dark' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'
                  }`}>
                    <p className={`text-[10px] md:text-xs font-bold ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      Contre-offre à <span className="font-black">{lastCounterOffer?.salary.toLocaleString()} $</span>.
                    </p>
                    <button 
                      onClick={acceptCounter}
                      className="bg-emerald-600 text-white px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-[10px] md:text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg"
                    >
                      Accepter
                    </button>
                  </div>
                )}

                <form onSubmit={convinceCandidate} className={`p-4 md:p-6 border-t flex gap-2 md:gap-3 transition-colors ${
                  theme === 'dark' ? 'bg-black/20 border-white/10' : 'bg-white border-black/5'
                }`}>
                  <input 
                    type="text"
                    value={negotiationChatInput}
                    onChange={(e) => setNegotiationChatInput(e.target.value)}
                    placeholder="Convaincre..."
                    className={`flex-1 rounded-xl md:rounded-2xl px-4 md:px-6 py-2 md:py-3 text-xs md:text-sm focus:ring-2 outline-none transition-all ${
                      theme === 'dark' ? 'bg-white/5 border-white/10 text-white focus:ring-white/20' : 'bg-gray-100 border-none focus:ring-black'
                    }`}
                  />
                  <button 
                    type="submit"
                    disabled={!negotiationChatInput.trim() || isWaitingForAI}
                    className={`p-2 md:p-3 rounded-xl md:rounded-2xl transition-all disabled:opacity-50 ${
                      theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'
                    }`}
                  >
                    <Send className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </form>
              </div>

              {/* Right: Offer Controls */}
              <div className="flex-1 md:flex-none md:w-96 p-6 md:p-8 space-y-6 md:space-y-10 overflow-y-auto">
                <div className={`p-4 md:p-6 rounded-2xl md:rounded-3xl border space-y-3 md:space-y-4 transition-colors ${
                  theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-black/5'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>Coût Total</span>
                    <span className="text-lg md:text-xl font-mono font-bold text-emerald-500">
                      {((offeredSalary + offeredBenefits.reduce((acc, id) => acc + (gameState?.benefits.find(b => b.id === id)?.costPerEmployee || 0), 0)) * (selectedCandidate.isInternational ? 2 : 1)).toLocaleString()} $
                    </span>
                  </div>
                  <button 
                    onClick={sendOffer}
                    disabled={isWaitingForAI}
                    className={`w-full py-3 md:py-4 rounded-xl md:rounded-2xl font-bold transition-all flex items-center justify-center gap-2 md:gap-3 disabled:opacity-50 shadow-xl ${
                      theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'
                    }`}
                  >
                    Envoyer l'offre <Send className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
                
                <div className="space-y-6 md:space-y-8">
                  <div>
                    <label className={`block text-[10px] font-bold uppercase tracking-widest mb-2 md:mb-3 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>Salaire Mensuel ($)</label>
                    <input 
                      type="number" 
                      value={offeredSalary}
                      onChange={(e) => setOfferedSalary(Number(e.target.value))}
                      className={`w-full px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl border font-mono font-bold text-base md:text-lg focus:ring-2 outline-none transition-all ${
                        theme === 'dark' ? 'bg-white/5 border-white/10 text-white focus:ring-white/20' : 'bg-white border-gray-200 focus:ring-black'
                      }`}
                    />
                  </div>

                  <div className="space-y-3 md:space-y-4">
                    <label className={`block text-[10px] font-bold uppercase tracking-widest mb-2 md:mb-3 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>Avantages Inclus</label>
                    <div className="grid grid-cols-1 gap-2">
                      {gameState?.benefits.map(benefit => {
                        const isSelected = offeredBenefits.includes(benefit.id);
                        const isPremium = benefit.id === 'pension' || benefit.id === 'dental';
                        return (
                          <button
                            key={benefit.id}
                            onClick={() => setOfferedBenefits(prev => 
                              prev.includes(benefit.id) ? prev.filter(id => id !== benefit.id) : [...prev, benefit.id]
                            )}
                            className={`p-3 md:p-4 rounded-xl md:rounded-2xl border text-left transition-all relative overflow-hidden ${
                              isSelected 
                                ? (theme === 'dark' ? 'bg-hec-accent/20 border-hec-accent text-white' : 'bg-hec-blue/10 border-hec-blue text-hec-blue') 
                                : (isPremium 
                                    ? (theme === 'dark' ? 'border-amber-500/50 bg-amber-500/10 hover:border-amber-500' : 'border-amber-400 bg-amber-50 hover:border-amber-500')
                                    : (theme === 'dark' ? 'bg-white/5 border-white/10 text-gray-500 hover:border-white/20' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300'))
                            }`}
                          >
                            {isPremium && !isSelected && (
                              <div className="absolute top-0 right-0 bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded-bl-lg">PREMIUM</div>
                            )}
                            <div className="flex justify-between items-center">
                              <span className={`text-[10px] md:text-xs font-bold ${isPremium && !isSelected ? 'text-amber-600 dark:text-amber-400' : ''}`}>{benefit.name}</span>
                              {isSelected && <CheckCircle2 className="w-3 h-3 fill-current" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Chat Modal */}
      <AnimatePresence>
        {activeChatEmployee && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[650px] border transition-colors ${
                theme === 'dark' ? 'bg-hec-blue border-white/10' : 'bg-white border-black/5'
              }`}
            >
              <div className={`p-6 border-b flex items-center justify-between transition-colors ${
                theme === 'dark' ? 'bg-black/20 border-white/10' : 'bg-gray-50 border-black/5'
              }`}>
                <div className="flex items-center gap-4">
                  <img 
                    src={activeChatEmployee.avatarUrl} 
                    className={`w-12 h-12 rounded-2xl object-cover border ${theme === 'dark' ? 'border-white/10' : 'border-white'}`} 
                    referrerPolicy="no-referrer" 
                  />
                  <div>
                    <h3 className="font-bold">{activeChatEmployee.name}</h3>
                    <p className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{activeChatEmployee.role} • {activeChatEmployee.seniority}</p>
                  </div>
                </div>
                <button onClick={() => setActiveChatEmployeeId(null)} className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`}>
                  <XCircle className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className={`flex-1 overflow-y-auto p-6 space-y-4 transition-colors ${
                theme === 'dark' ? 'bg-black/40' : 'bg-gray-50/50'
              }`}>
                {activeChatEmployee.chatHistory?.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-8">
                    <MessageSquare className="w-16 h-16 mb-4 opacity-10" />
                    <p className="text-sm italic">Commencez une discussion avec {activeChatEmployee.name}.</p>
                  </div>
                ) : (
                  activeChatEmployee.chatHistory?.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.sender === 'player' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-4 rounded-3xl text-sm shadow-sm ${
                        msg.sender === 'player' 
                          ? (theme === 'dark' ? 'bg-white text-black rounded-tr-none' : 'bg-black text-white rounded-tr-none') 
                          : (theme === 'dark' ? 'bg-white/10 border border-white/10 text-white rounded-tl-none' : 'bg-white border border-black/5 rounded-tl-none')
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className={`p-4 rounded-3xl rounded-tl-none border transition-colors ${
                      theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-black/5 shadow-sm'
                    }`}>
                      <Loader2 className="w-4 h-4 animate-spin text-hec-accent" />
                    </div>
                  </div>
                )}
              </div>

              <div className={`p-3 border-t flex flex-col gap-3 transition-colors ${
                theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-black/5'
              }`}>
                <div className="flex flex-wrap gap-2">
                  {gameState?.benefits.filter(b => {
                    const me = gameState?.players.find(([id]) => id === playerId)?.[1];
                    return !me?.benefits.includes(b.id) && !activeChatEmployee.personalBenefits?.includes(b.id);
                  }).map(b => {
                    const isPremium = b.id === 'pension' || b.id === 'dental';
                    const isSelected = selectedPersonalBenefits.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => {
                          setSelectedPersonalBenefits(prev => 
                            prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]
                          );
                        }}
                        className={`text-[10px] px-3 py-1.5 rounded-full font-bold transition-colors border relative overflow-hidden ${
                          isSelected
                            ? 'bg-hec-blue text-white border-hec-blue'
                            : (isPremium 
                                ? (theme === 'dark' ? 'bg-amber-500/10 text-amber-400 border-amber-500/50 hover:border-amber-500' : 'bg-amber-50 text-amber-600 border-amber-400 hover:border-amber-500')
                                : (theme === 'dark' ? 'bg-black/40 text-gray-400 border-white/10 hover:border-white/30' : 'bg-white text-gray-600 border-black/10 hover:border-black/30'))
                        }`}
                      >
                        {b.name} ({b.costPerEmployee}$/mois) {isPremium && !isSelected && '💎'}
                      </button>
                    );
                  })}
                  {gameState?.benefits.filter(b => {
                    const me = gameState?.players.find(([id]) => id === playerId)?.[1];
                    return !me?.benefits.includes(b.id) && !activeChatEmployee.personalBenefits?.includes(b.id);
                  }).length === 0 && (
                    <span className={`text-xs italic ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      Tous les avantages disponibles ont déjà été offerts.
                    </span>
                  )}
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={() => {
                      if (selectedPersonalBenefits.length > 0) {
                        safeSend({ type: 'OFFER_PERSONAL_BENEFITS', employeeId: activeChatEmployee.id, benefitIds: selectedPersonalBenefits });
                        setSelectedPersonalBenefits([]);
                      }
                    }}
                    disabled={selectedPersonalBenefits.length === 0}
                    className="px-4 py-2 bg-hec-blue hover:bg-hec-accent disabled:opacity-50 disabled:hover:bg-hec-blue text-white text-sm font-bold rounded-lg transition-colors"
                  >
                    Offrir les avantages sélectionnés
                  </button>
                </div>
              </div>

              <form onSubmit={sendChatMessage} className={`p-6 border-t flex gap-3 transition-colors ${
                theme === 'dark' ? 'bg-black/20 border-white/10' : 'bg-white border-black/5'
              }`}>
                <input 
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Écrivez votre message..."
                  className={`flex-1 rounded-2xl px-6 py-3 text-sm focus:ring-2 outline-none transition-all ${
                    theme === 'dark' ? 'bg-white/5 border-white/10 text-white focus:ring-white/20' : 'bg-gray-100 border-none focus:ring-black'
                  }`}
                />
                <button 
                  type="submit"
                  disabled={!chatInput.trim() || isTyping}
                  className={`p-3 rounded-2xl transition-all disabled:opacity-50 ${
                    theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
