/**
 * Facility data for the modules that ship switched OFF by default (§4):
 * Library, Transport, Hostel. Same deterministic-generation approach as the
 * student roster — nothing is stored until someone issues a book, assigns a
 * seat, or allocates a bed.
 */

import { rand, randInt, pick, chance, hash } from './rng.js';
import { allStudents } from './data.js';
import { daysBetween, toIsoDate } from './domain.js';
import * as store from './store.js';

const SEED = 'shahjalal-facilities';

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

const BOOK_TITLES = [
  ['Padma Nadir Majhi', 'Manik Bandopadhyay', 'Bangla Literature'],
  ['Lalsalu', 'Syed Waliullah', 'Bangla Literature'],
  ['Sonar Tori', 'Rabindranath Tagore', 'Bangla Literature'],
  ['Agnibina', 'Kazi Nazrul Islam', 'Bangla Literature'],
  ['Hajar Bachhor Dhore', 'Zahir Raihan', 'Bangla Literature'],
  ['Concepts of Physics Vol 1', 'H. C. Verma', 'Physics'],
  ['Fundamentals of Physics', 'Halliday & Resnick', 'Physics'],
  ['Organic Chemistry', 'Morrison & Boyd', 'Chemistry'],
  ['General Chemistry', 'Linus Pauling', 'Chemistry'],
  ['Higher Algebra', 'Hall & Knight', 'Mathematics'],
  ['Calculus Made Easy', 'Silvanus Thompson', 'Mathematics'],
  ['A Textbook of Higher Mathematics', 'S. U. Ahmed', 'Mathematics'],
  ['Biology for Secondary Level', 'Gazi Azmal', 'Biology'],
  ['Campbell Biology', 'Urry & Cain', 'Biology'],
  ['Principles of Accounting', 'Weygandt & Kimmel', 'Accounting'],
  ['Business Studies Handbook', 'M. A. Hakim', 'Business'],
  ['Bangladesh: A Legacy of Blood', 'Anthony Mascarenhas', 'History'],
  ['The Unfinished Memoirs', 'Sheikh Mujibur Rahman', 'History'],
  ['A Brief History of Time', 'Stephen Hawking', 'Science'],
  ['Cosmos', 'Carl Sagan', 'Science'],
  ['Wings of Fire', 'A. P. J. Abdul Kalam', 'Biography'],
  ['Oxford Advanced Learner\'s Dictionary', 'Oxford Press', 'Reference'],
  ['English Grammar in Use', 'Raymond Murphy', 'English'],
  ['Wren & Martin English Grammar', 'Wren & Martin', 'English'],
  ['Introduction to Algorithms', 'Cormen et al.', 'Computer Science'],
  ['Computer Fundamentals', 'P. K. Sinha', 'Computer Science'],
  ['Bangladesh Constitution Annotated', 'Mahmudul Islam', 'Civics'],
  ['Economics for HSC', 'Abdur Rob', 'Economics'],
  ['Geography of Bangladesh', 'Haroun Er Rashid', 'Geography'],
  ['Islamic Studies Reader', 'Dr. Muhammad Shahidullah', 'Religion'],
  ['Three Men in a Boat', 'Jerome K. Jerome', 'Fiction'],
  ['The Old Man and the Sea', 'Ernest Hemingway', 'Fiction'],
  ['Treasure Island', 'R. L. Stevenson', 'Fiction'],
  ['Feluda Samagra', 'Satyajit Ray', 'Fiction'],
  ['Misir Ali Omnibus', 'Humayun Ahmed', 'Fiction'],
  ['Himu Samagra', 'Humayun Ahmed', 'Fiction'],
];

let _books = null;

export function allBooks() {
  if (_books) return _books;
  _books = BOOK_TITLES.map(([title, author, subject], i) => {
    const key = `${SEED}|book|${i}`;
    const copies = randInt(key, 2, 9);
    return {
      id: `BK-${String(1000 + i)}`,
      accession: `ACC-${2015 + (i % 10)}-${String(100 + i)}`,
      isbn: `978-${randInt(`${key}|i1`, 100, 999)}-${randInt(`${key}|i2`, 10000, 99999)}-${randInt(`${key}|i3`, 0, 9)}`,
      title,
      author,
      subject,
      publisher: pick(`${key}|pub`, ['Anupam Prakashani', 'Hasan Book House', 'Oxford University Press', 'Pearson', 'Prothoma', 'Ananda Publishers']),
      year: randInt(`${key}|yr`, 2005, 2025),
      shelf: `${String.fromCharCode(65 + (i % 8))}-${1 + (i % 5)}`,
      copies,
      copyIds: Array.from({ length: copies }, (_, c) => `BK-${String(1000 + i)}-C${c + 1}`),
    };
  });
  return _books;
}

/** Library policy — 14-day loan, 2 BDT/day overdue fine, 2 books per student. */
export const LIBRARY_POLICY = { loanDays: 14, finePerDay: 2, maxBooks: 2 };

/**
 * Baseline loans: a realistic slice of copies are already out on loan, some of
 * them overdue, so the overdue report has something to show on first open.
 */
export function activeLoans(today) {
  const overrides = store.getLoans();
  const books = allBooks();
  const students = allStudents();
  const loans = [];

  for (const book of books) {
    for (const copyId of book.copyIds) {
      if (Object.prototype.hasOwnProperty.call(overrides, copyId)) {
        const o = overrides[copyId];
        if (o) loans.push({ ...o, copyId, book });
        continue; // explicit null means returned
      }
      if (!chance(`${SEED}|loan|${copyId}`, 0.22)) continue;
      const student = students[hash(`${SEED}|borrower|${copyId}`) % students.length];
      const daysAgo = randInt(`${SEED}|since|${copyId}`, 1, 32);
      const issued = new Date(today);
      issued.setDate(issued.getDate() - daysAgo);
      const due = new Date(issued);
      due.setDate(due.getDate() + LIBRARY_POLICY.loanDays);
      loans.push({
        copyId,
        book,
        studentId: student.id,
        studentName: student.name,
        classKey: student.classKey,
        issuedOn: toIsoDate(issued),
        dueOn: toIsoDate(due),
      });
    }
  }
  return loans;
}

export function fineFor(loan, today) {
  const days = daysBetween(loan.dueOn, today);
  return days > 0 ? days * LIBRARY_POLICY.finePerDay : 0;
}

/** Is this loan past its due date, as of `today`? */
export function isOverdue(loan, today) {
  return daysBetween(loan.dueOn, today) > 0;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const ROUTE_DEFS = [
  { id: 'R1', name: 'Ambarkhana — Zindabazar', stops: ['Ambarkhana Point', 'Chowhatta', 'Zindabazar', 'Campus'], fare: 1200, model: 'Ashok Leyland Viking', capacity: 52 },
  { id: 'R2', name: 'Tilagarh — Subid Bazar', stops: ['Tilagarh Point', 'MC College', 'Subid Bazar', 'Campus'], fare: 1400, model: 'Tata LP 909', capacity: 45 },
  { id: 'R3', name: 'South Surma — Kadamtali', stops: ['Kadamtali Bus Stand', 'Humayun Rashid Chattar', 'Keane Bridge', 'Campus'], fare: 1600, model: 'Hino AK1J', capacity: 55 },
  { id: 'R4', name: 'Uposhohor — Mirabazar', stops: ['Uposhohor Gate', 'Shibganj', 'Mirabazar', 'Campus'], fare: 1200, model: 'Ashok Leyland Viking', capacity: 52 },
  { id: 'R5', name: 'Modina Market — Pathantula', stops: ['Modina Market', 'Pathantula', 'Bagbari', 'Campus'], fare: 1500, model: 'Tata LP 909', capacity: 45 },
  { id: 'R6', name: 'Golapganj Express', stops: ['Golapganj Bazar', 'Chandai', 'Shahi Eidgah', 'Campus'], fare: 2200, model: 'Toyota Coaster', capacity: 32 },
];

let _routes = null;

export function allRoutes() {
  if (_routes) return _routes;
  _routes = ROUTE_DEFS.map((r, i) => {
    const key = `${SEED}|route|${r.id}`;
    return {
      ...r,
      vehicle: {
        reg: `Sylhet-Metro-Ga-${randInt(`${key}|v1`, 11, 19)}-${randInt(`${key}|v2`, 1000, 9999)}`,
        model: r.model,
        capacity: r.capacity,
      },
      departure: ['07:10', '07:20', '06:50', '07:15', '07:05', '06:30'][i],
      arrival: ['08:15', '08:20', '08:10', '08:15', '08:10', '08:05'][i],
    };
  });
  return _routes;
}

export function routeById(id) {
  return allRoutes().find((r) => r.id === id) || null;
}

/**
 * Seat allocation.
 *
 * Students apply for transport; the office assigns them to a route with a free
 * seat. Assigning at random would overfill routes, so applicants are walked in
 * a stable order and placed on their preferred route, falling through to the
 * next one with space. Anyone who does not fit lands on a waiting list — which
 * is what actually happens when the fleet is full.
 */
let _assignment = null;

export function transportAssignment() {
  if (_assignment) return _assignment;
  const routes = allRoutes();
  const seats = new Map(routes.map((r) => [r.id, []]));
  const waiting = [];

  for (const s of allStudents()) {
    if (!s.wantsTransport) continue;
    const preferred = hash(`${SEED}|pref|${s.id}`) % routes.length;
    let placed = false;
    for (let i = 0; i < routes.length && !placed; i++) {
      const route = routes[(preferred + i) % routes.length];
      const seated = seats.get(route.id);
      if (seated.length < route.vehicle.capacity) {
        seated.push({
          ...s,
          routeId: route.id,
          stop: route.stops[hash(`${SEED}|stop|${s.id}`) % (route.stops.length - 1)],
        });
        placed = true;
      }
    }
    if (!placed) waiting.push(s);
  }

  _assignment = { seats, waiting, applicants: allStudents().filter((s) => s.wantsTransport).length };
  return _assignment;
}

/** Students assigned to a route, with their boarding stop. */
export function routeRoster(routeId) {
  return transportAssignment().seats.get(routeId) || [];
}

/** Applicants who could not be seated — the transport waiting list. */
export function transportWaitlist() {
  return transportAssignment().waiting;
}

/** The route a student rides, or null. */
export function routeOf(studentId) {
  for (const [routeId, riders] of transportAssignment().seats) {
    if (riders.some((r) => r.id === studentId)) return routeById(routeId);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hostel
// ---------------------------------------------------------------------------

const BLOCKS = [
  { id: 'BH-A', name: 'Bijoy Block (Boys)', gender: 'Male', floors: 3, roomsPerFloor: 10, beds: 4 },
  { id: 'GH-A', name: 'Shapla Block (Girls)', gender: 'Female', floors: 3, roomsPerFloor: 10, beds: 4 },
  { id: 'BH-B', name: 'Shaheed Block (Boys)', gender: 'Male', floors: 2, roomsPerFloor: 8, beds: 6 },
];

let _rooms = null;

export function allHostelRooms() {
  if (_rooms) return _rooms;
  _rooms = [];
  for (const block of BLOCKS) {
    for (let f = 1; f <= block.floors; f++) {
      for (let r = 1; r <= block.roomsPerFloor; r++) {
        _rooms.push({
          id: `${block.id}-${f}${String(r).padStart(2, '0')}`,
          blockId: block.id,
          blockName: block.name,
          gender: block.gender,
          floor: f,
          number: `${f}${String(r).padStart(2, '0')}`,
          capacity: block.beds,
        });
      }
    }
  }
  return _rooms;
}

export const HOSTEL_BLOCKS = BLOCKS;

/** Allocate boarders to rooms deterministically, respecting gender per block. */
export function hostelAllocation() {
  const rooms = allHostelRooms();
  const boarders = allStudents().filter((s) => s.hostel);
  const byGender = { Male: [], Female: [] };
  for (const s of boarders) byGender[s.gender].push(s);

  const allocation = new Map(rooms.map((r) => [r.id, []]));
  for (const gender of ['Male', 'Female']) {
    const pool = byGender[gender];
    const eligible = rooms.filter((r) => r.gender === gender);
    let ri = 0;
    for (const student of pool) {
      // Fill rooms in order; skip full ones.
      let guard = 0;
      while (guard++ < eligible.length && allocation.get(eligible[ri % eligible.length].id).length >= eligible[ri % eligible.length].capacity) {
        ri++;
      }
      const room = eligible[ri % eligible.length];
      if (allocation.get(room.id).length < room.capacity) {
        allocation.get(room.id).push(student);
      }
    }
  }
  return { rooms, allocation, boarders };
}
