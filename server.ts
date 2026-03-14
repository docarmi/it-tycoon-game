import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Game Logic Types ---

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

const BENEFITS: Benefit[] = [
  { id: "remote", name: "Télétravail 100%", costPerEmployee: 100, attractiveness: 20 },
  { id: "insurance", name: "Assurance Santé Premium", costPerEmployee: 300, attractiveness: 15 },
  { id: "flexible", name: "Horaires Flexibles", costPerEmployee: 50, attractiveness: 10 },
  { id: "gym", name: "Abonnement Sport", costPerEmployee: 40, attractiveness: 5 },
  { id: "bonus", name: "Bonus Annuel", costPerEmployee: 500, attractiveness: 25 },
  { id: "pension", name: "Cotisation Fond de Pension", costPerEmployee: 1200, attractiveness: 40 },
  { id: "dental", name: "Soins Dentaires Complets", costPerEmployee: 800, attractiveness: 30 },
];

interface Contract {
  id: string;
  title: string;
  requiredCapacity: number;
  monthlyRevenue: number;
  duration: number; // Initial duration in weeks
  remainingWeeks: number; // Weeks left until deadline
  workload: number; // Total points to complete
  progress: number; // Points completed
  requiredRoles: Role[];
  penalty: number; // Fine per week late
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
  preferredBenefits: string[]; // IDs of benefits they like
  currentEmployerId: string | null;
  isInternational?: boolean;
  chatHistory: ChatMessage[];
  productivityHistory: number[];
  resignationNotice: number | null; // null if not resigning, 1 if notice given
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
  benefits: string[]; // IDs of offered benefits
  activeContracts: Contract[];
  lastRevenue: number;
  lastExpenses: number;
  weeksAtRisk: number;
  isUnderTutelage: boolean;
  targetedRecruitCount: number;
  totalHired: number;
  totalFired: number;
  customerSatisfaction: number;
  resignedThisWeek: Employee[]; // Full objects of employees who resigned this week
  inbox: InboxMessage[];
}

// --- Initial State ---

let players: Map<string, Player> = new Map();
let candidates: Employee[] = [];
let availableContracts: Contract[] = [];
let currentWeek = 1;
const MAX_WEEKS = 12; // 3 months

const ROLES: Role[] = [
  "Directeur de production",
  "Directeur adjoint",
  "Chargée de projet",
  "Programmeur",
  "Ingenieur informaticien"
];

const ROLE_CONFIG: Record<Role, { min: number; max: number; capacity: number }> = {
  "Directeur de production": { min: 6000, max: 12000, capacity: 50 },
  "Directeur adjoint": { min: 5000, max: 9000, capacity: 40 },
  "Programmeur": { min: 3000, max: 7000, capacity: 20 },
  "Chargée de projet": { min: 3000, max: 5000, capacity: 30 },
  "Ingenieur informaticien": { min: 6000, max: 11000, capacity: 25 }
};

const ROLE_CAPACITY: Record<Role, number> = {
  "Directeur de production": ROLE_CONFIG["Directeur de production"].capacity,
  "Directeur adjoint": ROLE_CONFIG["Directeur adjoint"].capacity,
  "Chargée de projet": ROLE_CONFIG["Chargée de projet"].capacity,
  "Programmeur": ROLE_CONFIG["Programmeur"].capacity,
  "Ingenieur informaticien": ROLE_CONFIG["Ingenieur informaticien"].capacity
};

const FIRST_NAMES = ["Alice", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy", "Kevin", "Laura", "Mallory", "Niaj", "Olivia", "Peggy", "Quentin", "Rupert", "Sybil", "Trent", "Uma", "Victor", "Wendy", "Xavier", "Yvonne", "Zelda", "Arthur", "Béatrice", "Cédric", "Diane", "Émile", "Florence", "Gaston", "Hélène", "Igor", "Juliette", "Kamel", "Léa", "Marc", "Nina", "Oscar", "Pauline", "Romain", "Sophie", "Théo", "Valérie"];
const LAST_NAMES = ["Martin", "Bernard", "Thomas", "Petit", "Robert", "Richard", "Durand", "Dubois", "Moreau", "Laurent", "Simon", "Michel", "Lefebvre", "Leroy", "Roux", "David", "Bertrand", "Morel", "Fournier", "Girard", "Bonnet", "Dupont", "Lambert", "Fontaine", "Rousseau", "Vincent", "Muller", "Lefevre", "Faure", "Andre", "Mercier", "Blanc", "Guerin", "Boyer", "Garnier", "Chevalier", "Francois", "Legrand", "Gauthier", "Garcia", "Perrin", "Robin", "Clement", "Morin", "Nicolas", "Henry", "Roussel", "Mathieu", "Gautier", "Masson", "Marchand", "Duval", "Denis", "Dumont", "Marie", "Lemaire", "Noel", "Meyer", "Dufour", "Meunier", "Brun", "Blanchard", "Giraud", "Joly", "Riviere", "Lucas", "Brunet", "Gaillard", "Barbier", "Arnaud", "Martinez", "Gerard", "Roche", "Renard", "Schmitt", "Roy", "Leroux", "Colin", "Vidal", "Caron", "Aubert", "Gomez", "Benoit", "Picard", "Magnier", "Rouxel", "Lemoine"];

function generateCandidate(isInternational: boolean = false, forcedRole?: Role, forcedSeniority?: "Stagiaire" | "Junior" | "Intermédiaire" | "Sénior"): Employee {
  const role = forcedRole || ROLES[Math.floor(Math.random() * ROLES.length)];
  const config = ROLE_CONFIG[role];
  
  const rand = Math.random();
  let seniority: "Stagiaire" | "Junior" | "Intermédiaire" | "Sénior" = forcedSeniority || "Junior";
  let salary = config.min;
  
  if (!forcedSeniority) {
    if (rand < 0.2) {
      seniority = "Stagiaire";
      salary = config.min * 0.5;
    } else if (rand < 0.5) {
      seniority = "Junior";
      salary = config.min;
    } else if (rand < 0.8) {
      seniority = "Intermédiaire";
      salary = config.min + (config.max - config.min) * 0.5;
    } else {
      seniority = "Sénior";
      salary = config.max;
    }
  } else {
    // Set salary based on forced seniority
    switch (forcedSeniority) {
      case "Stagiaire": salary = config.min * 0.5; break;
      case "Junior": salary = config.min; break;
      case "Intermédiaire": salary = config.min + (config.max - config.min) * 0.5; break;
      case "Sénior": salary = config.max; break;
    }
  }

  // Add a small random variation (+/- 5%)
  const variation = 0.95 + Math.random() * 0.1;
  let finalSalary = Math.floor(salary * variation);

  // Specific bonus for Senior Directeur de production
  if (role === "Directeur de production" && seniority === "Sénior") {
    finalSalary += 1000 + Math.floor(Math.random() * 2000); // Significant bonus
  }

  const preferredCount = 1 + Math.floor(Math.random() * 3);
  const preferred = [...BENEFITS].sort(() => 0.5 - Math.random()).slice(0, preferredCount).map(b => b.id);
  
  const seed = Math.random().toString(36).substring(7);
  const avatarUrl = `https://picsum.photos/seed/${seed}/200/200`;
  
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];

  return {
    id: Math.random().toString(36).substr(2, 9),
    name: `${firstName} ${lastName}` + (isInternational ? " 🌍" : ""),
    role,
    seniority,
    avatarUrl,
    minSalary: finalSalary,
    preferredBenefits: preferred,
    currentEmployerId: null,
    isInternational,
    chatHistory: [],
    productivityHistory: [],
    resignationNotice: null,
    status: 'Actif',
    leaveWeeksRemaining: 0
  };
}

function generateContract(): Contract {
  const titles = ["Développement App Mobile", "Audit Sécurité Cloud", "Migration Base de Données", "IA Prédictive Ventes", "Refonte Site E-commerce", "Support IT Niveau 3"];
  const title = titles[Math.floor(Math.random() * titles.length)];
  const requiredCapacity = 20 + Math.floor(Math.random() * 150);
  // Increased revenue multiplier from 150 to 450 to ensure profitability
  const monthlyRevenue = requiredCapacity * 450 + Math.floor(Math.random() * 10000);
  const duration = 4 + Math.floor(Math.random() * 8); // 4 to 12 weeks
  
  // Workload is based on capacity and duration
  const workload = requiredCapacity * duration;
  
  // Pick 1-2 required roles for the contract
  const rolesCount = 1 + Math.floor(Math.random() * 2);
  const requiredRoles = [...ROLES].sort(() => 0.5 - Math.random()).slice(0, rolesCount);

  return {
    id: Math.random().toString(36).substr(2, 9),
    title,
    requiredCapacity,
    monthlyRevenue,
    duration,
    remainingWeeks: duration,
    workload,
    progress: 0,
    requiredRoles,
    penalty: Math.floor(monthlyRevenue * 0.1) // 10% penalty per week late
  };
}

// Populate initial candidates (Limited Market)
for (let i = 0; i < 8; i++) {
  candidates.push(generateCandidate(false));
}
for (let i = 0; i < 4; i++) {
  availableContracts.push(generateContract());
}

// --- Server Setup ---

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  server.on('error', (err) => {
    console.error('Server error:', err);
  });
  const wss = new WebSocketServer({ server });
  const PORT = 3000;
  // Game Logic: Process one week
  function processOneWeek() {
    if (currentWeek >= MAX_WEEKS) return;

    players.forEach((player, id) => {
      player.resignedThisWeek = [];
      
      // 0. Handle Resignations and Leaves
      const remainingEmployees: Employee[] = [];
      player.employees.forEach(emp => {
        if (emp.resignationNotice !== null) {
          emp.resignationNotice--;
          if (emp.resignationNotice <= 0) {
            player.resignedThisWeek.push(emp);
            player.inbox.push({
              id: Math.random().toString(36).substr(2, 9),
              from: emp.name,
              subject: "Démission",
              text: `Je vous informe de ma démission. Ce fut un plaisir de travailler avec vous, mais je pars vers de nouvelles opportunités.`,
              read: false,
              week: currentWeek
            });
            // Employee leaves
            return;
          }
        }
        
        // Check for new resignations
        // Poor conditions: only money (0 or 1 benefit) or under tutelage
        const totalBenefits = player.benefits.length + (emp.personalBenefits?.length || 0);
        const hasPoorConditions = totalBenefits <= 1;
        const isAtRisk = player.isUnderTutelage || hasPoorConditions;
        
        if (isAtRisk && emp.resignationNotice === null) {
          // Chance to resign: 15% if poor conditions, 30% if under tutelage
          const ghostChance = player.isUnderTutelage ? 0.3 : 0.15;
          const resignChance = player.isUnderTutelage ? 0.4 : 0.2;
          
          if (!emp.isLookingForJob && Math.random() < ghostChance) {
            emp.isLookingForJob = true;
          } else if (emp.isLookingForJob && Math.random() < resignChance) {
            emp.resignationNotice = 1; // 1 week notice
            emp.isLookingForJob = false;
            player.inbox.push({
              id: Math.random().toString(36).substr(2, 9),
              from: emp.name,
              subject: "Préavis de démission",
              text: `Je vous informe de mon intention de démissionner. Je quitterai l'entreprise la semaine prochaine.`,
              read: false,
              week: currentWeek
            });
          }
        } else if (!isAtRisk) {
          emp.isLookingForJob = false;
          if (emp.resignationNotice !== null) {
            emp.resignationNotice = null; // Cancel resignation if conditions improve
          }
        }

        // Handle Leaves
        if (emp.leaveWeeksRemaining > 0) {
          emp.leaveWeeksRemaining--;
          if (emp.leaveWeeksRemaining <= 0) {
            emp.status = 'Actif';
            player.inbox.push({
              id: Math.random().toString(36).substr(2, 9),
              from: "Ressources Humaines",
              subject: `Retour de ${emp.name}`,
              text: `${emp.name} est de retour de son congé et est prêt(e) à travailler.`,
              read: false,
              week: currentWeek
            });
          }
        } else if (emp.status === 'Actif') {
          const rand = Math.random();
          if (rand < 0.002) { // 0.2% Maternity
            emp.status = 'Maternité';
            emp.leaveWeeksRemaining = 12;
          } else if (rand < 0.007) { // 0.5% Long term sickness
            emp.status = 'Maladie long terme';
            emp.leaveWeeksRemaining = 4 + Math.floor(Math.random() * 5);
          } else if (rand < 0.037) { // 3% Vacation
            emp.status = 'Congé';
            emp.leaveWeeksRemaining = 1 + Math.floor(Math.random() * 2);
          } else if (rand < 0.057) { // 2% Short sickness
            emp.status = 'Maladie';
            emp.leaveWeeksRemaining = 1;
          }

          if (emp.status !== 'Actif') {
            player.inbox.push({
              id: Math.random().toString(36).substr(2, 9),
              from: "Ressources Humaines",
              subject: `Absence : ${emp.name}`,
              text: `${emp.name} sera absent(e) pour cause de ${emp.status} pendant ${emp.leaveWeeksRemaining} semaine(s).`,
              read: false,
              week: currentWeek
            });
          }
        }
        
        remainingEmployees.push(emp);
      });
      player.employees = remainingEmployees;

      if (player.isUnderTutelage) {
        // Even if under tutelage, we still processed resignations above
        // but we might want to skip the rest of the business logic if they are truly "blocked"
        // However, the current code allows them to continue until they hit the limit.
        // Let's keep the return if they are under tutelage for the rest of the logic.
        return;
      }

      let weeklyRevenue = 0;
      let weeklyPayroll = 0;
      let weeklyPenalty = 0;
      let weeklySatisfactionChange = 0;

      // 1. Calculate Payroll (Weekly base)
      let weeklyPayrollBase = 0;
      player.employees.forEach(emp => {
        const multiplier = emp.isInternational ? 2 : 1;
        let empMonthlyCost = emp.minSalary;
        const uniqueBenefits = new Set([...player.benefits, ...(emp.personalBenefits || [])]);
        uniqueBenefits.forEach(bId => {
          const benefit = BENEFITS.find(b => b.id === bId);
          if (benefit) empMonthlyCost += benefit.costPerEmployee;
        });
        
        let weeklyCost = (empMonthlyCost * multiplier) / 4;
        if (emp.status === 'Maternité' || emp.status === 'Maladie long terme') {
          weeklyCost = weeklyCost * 0.2; // Pay 20% during long leaves
        }
        weeklyPayrollBase += weeklyCost;
      });

      // Payroll is paid every 2 weeks
      const isPayDay = currentWeek % 2 === 0;
      const payrollToDeduct = isPayDay ? weeklyPayrollBase * 2 : 0;

      // 2. Calculate Team Productivity (Points per week)
      const SENIORITY_MULTIPLIER = {
        "Sénior": 2.5,
        "Intermédiaire": 1.8,
        "Junior": 1.0,
        "Stagiaire": 0.5
      };

      let totalTeamProductivity = 0;
      player.employees.forEach(emp => {
        let empProductivity = 0;
        if (emp.status === 'Actif') {
          const baseCap = ROLE_CAPACITY[emp.role] || 0;
          empProductivity = baseCap * SENIORITY_MULTIPLIER[emp.seniority];
        }
        totalTeamProductivity += empProductivity;
        
        if (!emp.productivityHistory) emp.productivityHistory = [];
        emp.productivityHistory.push(empProductivity);
        // Keep only last 12 weeks
        if (emp.productivityHistory.length > 12) emp.productivityHistory.shift();
      });

      // 3. Process Contracts and Calculate Revenue based on Progress
      const totalRequiredCapacity = player.activeContracts.reduce((acc, c) => acc + c.requiredCapacity, 0);
      const completedContracts: string[] = [];

      player.activeContracts.forEach(contract => {
        const share = contract.requiredCapacity / (totalRequiredCapacity || 1);
        const contractProductivity = totalTeamProductivity * share;
        
        // Actual progress made this week (capped by remaining workload)
        const actualProgress = Math.min(contractProductivity, contract.workload - contract.progress);
        
        // Revenue is now proportional to progress: (MonthlyRevenue / (4 * RequiredCapacity)) * actualProgress
        // This ensures that faster teams get paid faster and hiring more staff increases immediate revenue.
        const revenuePerPoint = contract.monthlyRevenue / (4 * contract.requiredCapacity);
        weeklyRevenue += actualProgress * revenuePerPoint;

        contract.progress += actualProgress;
        contract.remainingWeeks -= 1;
        
        if (contract.remainingWeeks < 0) {
          weeklyPenalty += contract.penalty;
          weeklySatisfactionChange -= 2; // Penalty for being late
        }

        if (contract.progress >= contract.workload) {
          completedContracts.push(contract.id);
          // Bonus satisfaction for completing on time or early
          if (contract.remainingWeeks >= 0) {
            weeklySatisfactionChange += 5;
          } else {
            weeklySatisfactionChange += 1; // Small boost even if late, because it's done
          }
        }
      });

      // Update satisfaction
      player.customerSatisfaction = Math.max(0, Math.min(100, player.customerSatisfaction + weeklySatisfactionChange));

      if (completedContracts.length > 0) {
        player.employees.forEach(emp => {
          if (emp.seniority === "Stagiaire") {
            emp.seniority = "Junior";
            emp.minSalary = Math.floor(emp.minSalary / 0.5);
          }
        });
      }

      player.activeContracts = player.activeContracts.filter(c => c.progress < c.workload);
      
      // Update Treasury
      player.money += (weeklyRevenue - payrollToDeduct - weeklyPenalty);
      player.lastRevenue = weeklyRevenue;
      player.lastExpenses = payrollToDeduct + weeklyPenalty;

      const debt = player.money < 0 ? Math.abs(player.money) : 0;
      const debtLimit = Math.max(5000, weeklyPayrollBase * 4); // 1 month of payroll

      if (debt >= debtLimit && weeklyPayroll > 0) {
        player.weeksAtRisk++;
        if (player.weeksAtRisk >= 6) {
          player.isUnderTutelage = true;
        }
      } else {
        player.weeksAtRisk = 0;
      }
    });

    // Market updates (more frequent since it's turn-based)
    if (candidates.length < 12 && Math.random() > 0.3) {
      candidates.push(generateCandidate(false));
    }
    if (availableContracts.length < 6 && Math.random() > 0.3) {
      availableContracts.push(generateContract());
    }

    currentWeek++;
    broadcastState();
  }

  function broadcastState() {
    const state = {
      players: Array.from(players.entries()),
      candidates,
      availableContracts,
      benefits: BENEFITS,
      currentWeek,
      maxWeeks: MAX_WEEKS,
      roleCapacity: ROLE_CAPACITY
    };
    const message = JSON.stringify({ type: "UPDATE", data: state });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  wss.on("connection", (ws) => {
    let playerId: string | null = null;

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
        case "JOIN":
          if (message.playerId && players.has(message.playerId)) {
            playerId = message.playerId;
            const player = players.get(playerId)!;
            if (message.companyName) player.companyName = message.companyName;
          } else {
            playerId = Math.random().toString(36).substr(2, 9);
            players.set(playerId, {
              id: playerId,
              companyName: message.companyName || "Entreprise Sans Nom",
              money: 50000,
              employees: [],
              benefits: [],
              activeContracts: [],
              lastRevenue: 0,
              lastExpenses: 0,
              weeksAtRisk: 0,
              isUnderTutelage: false,
              targetedRecruitCount: 0,
              totalHired: 0,
              totalFired: 0,
              customerSatisfaction: 100,
              resignedThisWeek: [],
              inbox: []
            });
          }
          ws.send(JSON.stringify({ type: "INIT", playerId, benefits: BENEFITS, roles: ROLES }));
          broadcastState();
          break;

        case "OFFER_PERSONAL_BENEFITS":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            const emp = player.employees.find(e => e.id === message.employeeId);
            if (emp && message.benefitIds && Array.isArray(message.benefitIds)) {
              if (!emp.personalBenefits) emp.personalBenefits = [];
              let totalCost = 0;
              const addedNames: string[] = [];
              
              message.benefitIds.forEach((bId: string) => {
                if (!emp.personalBenefits!.includes(bId)) {
                  emp.personalBenefits!.push(bId);
                  const benefit = BENEFITS.find(b => b.id === bId);
                  if (benefit) {
                    totalCost += benefit.costPerEmployee;
                    addedNames.push(benefit.name);
                  }
                }
              });
              
              if (addedNames.length > 0) {
                player.money -= totalCost; // Deduct from treasury immediately
                
                if (!emp.chatHistory) emp.chatHistory = [];
                emp.chatHistory.push({
                  sender: 'player',
                  text: `Je vous offre de nouveaux avantages personnels : ${addedNames.join(', ')}. J'espère que cela vous plaira !`,
                  timestamp: Date.now()
                });
                
                emp.isLookingForJob = false;
                emp.resignationNotice = null;
                
                emp.chatHistory.push({
                  sender: 'employee',
                  text: `Merci beaucoup ! C'est très apprécié. Je suis ravi de rester dans l'équipe.`,
                  timestamp: Date.now() + 1000
                });
                broadcastState();
              }
            }
          }
          break;

        case "SEND_CHAT":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            const employee = player.employees.find(e => e.id === message.employeeId);
            if (employee) {
              if (!employee.chatHistory) employee.chatHistory = [];
              employee.chatHistory.push({
                sender: message.sender,
                text: message.text,
                timestamp: Date.now()
              });
              // Keep only last 50 messages
              if (employee.chatHistory.length > 50) employee.chatHistory.shift();
              
              if (message.cancelResignation) {
                employee.resignationNotice = null;
              }
              
              broadcastState();
            }
          }
          break;

        case "SEND_CANDIDATE_CHAT":
          if (playerId && players.has(playerId)) {
            let candidate = candidates.find(c => c.id === message.candidateId);
            if (!candidate) {
              for (const p of players.values()) {
                const ghost = p.employees.find(e => e.id === message.candidateId && e.isLookingForJob);
                if (ghost) {
                  candidate = ghost;
                  break;
                }
              }
            }
            if (candidate) {
              if (!candidate.chatHistory) candidate.chatHistory = [];
              candidate.chatHistory.push({
                sender: message.sender,
                text: message.text,
                timestamp: Date.now(),
                companyName: message.companyName
              });
              if (candidate.chatHistory.length > 50) candidate.chatHistory.shift();
              broadcastState();
            }
          }
          break;

        case "MARK_EMAIL_READ":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            const email = player.inbox.find(e => e.id === message.emailId);
            if (email) {
              email.read = true;
              broadcastState();
            }
          }
          break;

        case "MARK_MESSAGE_READ":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            const msg = player.inbox.find(m => m.id === message.messageId);
            if (msg) {
              msg.read = true;
              broadcastState();
            }
          }
          break;

        case "APPLY_CONTRACT":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            if (player.isUnderTutelage) return;

            const contractIndex = availableContracts.findIndex(c => c.id === message.contractId);
            if (contractIndex !== -1) {
              const contract = availableContracts[contractIndex];
              
              // 1. Calculate current capacity
              const SENIORITY_MULTIPLIER = {
                "Sénior": 2.5,
                "Intermédiaire": 1.8,
                "Junior": 1.0,
                "Stagiaire": 0.5
              };

              let currentCapacity = 0;
              player.employees.forEach(emp => {
                const cap = ROLE_CAPACITY[emp.role] || 0;
                currentCapacity += cap * SENIORITY_MULTIPLIER[emp.seniority];
              });

              // 2. Check if enough capacity remains
              const usedCapacity = player.activeContracts.reduce((acc, c) => acc + c.requiredCapacity, 0);
              const availableCapacity = currentCapacity - usedCapacity;

              // 3. Check if required roles are present in the team
              const playerRoles = new Set(player.employees.map(e => e.role));
              const hasRequiredRoles = contract.requiredRoles.every(role => playerRoles.has(role));

              if (availableCapacity >= contract.requiredCapacity && hasRequiredRoles) {
                player.activeContracts.push(contract);
                availableContracts.splice(contractIndex, 1);
                broadcastState();
              }
            }
          }
          break;

        case "UPDATE_BENEFITS":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            if (player.isUnderTutelage) return;
            player.benefits = message.benefits;
            broadcastState();
          }
          break;

        case "SEARCH_INTERNATIONAL":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            if (player.isUnderTutelage) return;
            if (player.money >= 5000) {
              player.money -= 5000;
              const newCandidate = generateCandidate(true);
              candidates.push(newCandidate);
              broadcastState();
            }
          }
          break;

        case "TARGETED_RECRUITMENT":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            if (player.isUnderTutelage) return;
            
            const cost = player.targetedRecruitCount >= 2 ? 5000 : 0;
            
            if (player.money >= cost) {
              player.money -= cost;
              player.targetedRecruitCount++;
              const newCandidate = generateCandidate(false, message.role, message.seniority);
              newCandidate.isTargeted = true;
              candidates.unshift(newCandidate);
              broadcastState();
            }
          }
          break;

        case "ADVANCE_WEEK":
          processOneWeek();
          break;
        case "NEGOTIATE_RESULT":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            if (player.isUnderTutelage) return;
            const { candidateId, status, finalSalary } = message;
            
            if (status === "ACCEPTED") {
              const candidateIndex = candidates.findIndex(c => c.id === candidateId);
              if (candidateIndex !== -1) {
                const candidate = candidates[candidateIndex];
                candidate.currentEmployerId = playerId;
                candidate.minSalary = finalSalary; // Update to negotiated salary
                candidate.hiredAtWeek = currentWeek;
                player.employees.unshift(candidate);
                player.totalHired++;
                candidates.splice(candidateIndex, 1);
                broadcastState();
              } else {
                // Look for ghost employee
                let ghostEmp: Employee | null = null;
                let ghostEmployer: any = null;
                for (const p of players.values()) {
                  if (p.id !== playerId) {
                    const idx = p.employees.findIndex(e => e.id === candidateId && e.isLookingForJob);
                    if (idx !== -1) {
                      ghostEmp = p.employees[idx];
                      ghostEmployer = p;
                      break;
                    }
                  }
                }
                if (ghostEmp && ghostEmployer) {
                  ghostEmp.currentEmployerId = playerId;
                  ghostEmp.minSalary = finalSalary;
                  ghostEmp.hiredAtWeek = currentWeek;
                  ghostEmp.isLookingForJob = false;
                  ghostEmp.resignationNotice = null;
                  ghostEmp.personalBenefits = [];
                  player.employees.unshift(ghostEmp);
                  player.totalHired++;
                  
                  ghostEmployer.employees = ghostEmployer.employees.filter((e: Employee) => e.id !== ghostEmp!.id);
                  ghostEmployer.inbox.push({
                    id: Math.random().toString(36).substr(2, 9),
                    from: "Ressources Humaines",
                    subject: "Départ inattendu",
                    text: `${ghostEmp.name} a été débauché(e) par une autre entreprise offrant de meilleures conditions !`,
                    read: false,
                    week: currentWeek
                  });
                  broadcastState();
                }
              }
            }
          }
          break;

        case "HIRE":
          // Legacy hire removed in favor of negotiation
          break;
          
        case "FIRE":
          if (playerId && players.has(playerId)) {
            const player = players.get(playerId)!;
            // Allow firing even under tutelage to help player recover
            const empIndex = player.employees.findIndex(e => e.id === message.employeeId);
            if (empIndex !== -1) {
              const emp = player.employees[empIndex];
              emp.currentEmployerId = null;
              candidates.push(emp);
              player.employees.splice(empIndex, 1);
              player.totalFired++;
              broadcastState();
            }
          }
          break;
      }
    } catch (e) {
      console.error("Failed to parse message from client:", e);
    }
  });

    ws.on("error", (err) => {
      console.error("WebSocket client error:", err);
    });

    ws.on("close", () => {
      if (playerId) {
        // We could keep the player for a while, but for this sim we remove them
        // players.delete(playerId);
        // broadcastState();
      }
    });
  });

  // API routes
  app.get("/api/config", (req, res) => {
    res.json({
      geminiApiKey: process.env.GEMINI_API_KEY || ""
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
