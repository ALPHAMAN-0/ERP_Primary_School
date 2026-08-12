/**
 * §9 — fixed roles, not a permission matrix.
 *
 * In production this maps to ASP.NET Identity roles and `[Authorize(Roles=…)]`
 * attributes on controllers. Here it drives which nav entries exist and which
 * screens a persona may open — the same allow-list, evaluated client-side.
 *
 * The demo adds a persona switcher so a reviewer can see all eight roles
 * without eight sets of credentials.
 */

import { ROLES, MODULES } from './spec.js';
import * as store from './store.js';
import { allStudents, allStaff, multiChildFamilies, studentById } from './data.js';

/** Screens each role may open. Everything not listed is denied. */
const ROUTE_ACCESS = {
  ADMIN: ['*'],
  TEACHER: ['dashboard', 'students', 'student', 'attendance', 'exams', 'marksheet', 'routine', 'notices', 'library', 'profile'],
  ACCOUNTANT: ['dashboard', 'students', 'student', 'fees', 'invoice', 'notices', 'profile'],
  LIBRARIAN: ['dashboard', 'library', 'students', 'student', 'notices', 'profile'],
  TRANSPORT: ['dashboard', 'transport', 'students', 'student', 'notices', 'profile'],
  HR: ['dashboard', 'hr', 'staff', 'notices', 'profile'],
  STUDENT: ['dashboard', 'portal', 'routine', 'notices', 'profile'],
  PARENT: ['dashboard', 'portal', 'fees-parent', 'routine', 'notices', 'profile'],
};

/**
 * The signed-in identity for each persona. Staff personas bind to a real
 * generated employee, and the Student/Parent personas bind to a real student
 * and a real multi-child family respectively — so the portal has something
 * meaningful to show rather than placeholder text.
 */
let _identities = null;

function buildIdentities() {
  const staff = allStaff();
  const findByRole = (role, skipIds = []) =>
    staff.find((s) => s.roles.includes(role) && !skipIds.includes(s.id));

  const principal = staff[0];
  const teacher = staff.find((s) => s.designationId === 'ASTT' && s.roles.includes('TEACHER')) || staff[6];
  const accountant = findByRole('ACCOUNTANT') || staff[0];
  const librarian = findByRole('LIBRARIAN') || staff[0];
  const transport = findByRole('TRANSPORT') || staff[0];
  const hr = findByRole('HR') || staff[1];

  // A student in the college section shows off period-wise attendance and HSC
  // eligibility, which is the more interesting of the two attendance modes.
  const students = allStudents();
  const demoStudent =
    students.find((s) => s.schoolSection === 'College' && s.groupId === 'SCI') || students[0];

  // A parent with several children exercises the child switcher (§10).
  const families = multiChildFamilies(60);
  const demoFamily = families.find((f) => f.children.length >= 2) || null;

  return {
    ADMIN: { kind: 'staff', staffId: principal.id, name: principal.name, subtitle: principal.designation },
    TEACHER: { kind: 'staff', staffId: teacher.id, name: teacher.name, subtitle: `${teacher.designation} · Class Teacher` },
    ACCOUNTANT: { kind: 'staff', staffId: accountant.id, name: accountant.name, subtitle: accountant.designation },
    LIBRARIAN: { kind: 'staff', staffId: librarian.id, name: librarian.name, subtitle: librarian.designation },
    TRANSPORT: { kind: 'staff', staffId: transport.id, name: transport.name, subtitle: transport.designation },
    HR: { kind: 'staff', staffId: hr.id, name: hr.name, subtitle: `${hr.designation} · HR` },
    STUDENT: {
      kind: 'student',
      studentId: demoStudent.id,
      name: demoStudent.name,
      subtitle: `${demoStudent.gradeName} · Roll ${demoStudent.roll} · ID ${demoStudent.id}`,
    },
    PARENT: {
      kind: 'parent',
      familyId: demoFamily?.id || null,
      childIds: demoFamily ? demoFamily.children.map((c) => c.id) : [demoStudent.id],
      name: demoFamily ? demoFamily.father : demoStudent.father,
      subtitle: demoFamily ? `Guardian of ${demoFamily.children.length} students` : 'Guardian',
    },
  };
}

export function identities() {
  if (!_identities) _identities = buildIdentities();
  return _identities;
}

store.subscribe((kind) => {
  if (kind === 'reset' || kind === 'import') _identities = null;
});

export function currentRole() {
  return store.getSettings().persona || 'ADMIN';
}

export function currentIdentity() {
  return identities()[currentRole()];
}

export function currentRoleMeta() {
  return ROLES[currentRole()];
}

export function switchPersona(roleId) {
  if (!ROLES[roleId]) return;
  store.setSetting('persona', roleId);
}

export function can(routeId) {
  const access = ROUTE_ACCESS[currentRole()] || [];
  return access.includes('*') || access.includes(routeId);
}

export function isAdmin() {
  return currentRole() === 'ADMIN';
}

/** Which modules are switched on (§4) — admin settings override spec defaults. */
export function enabledModules() {
  const configured = store.getSettings().modules;
  if (!configured) return MODULES.filter((m) => m.defaultOn).map((m) => m.id);
  return MODULES.filter((m) => configured[m.id] ?? m.defaultOn).map((m) => m.id);
}

export function isModuleOn(moduleId) {
  return enabledModules().includes(moduleId);
}

export function setModule(moduleId, on) {
  const mod = MODULES.find((m) => m.id === moduleId);
  if (mod?.core && !on) return false; // core modules cannot be switched off
  const current = store.getSettings().modules || Object.fromEntries(MODULES.map((m) => [m.id, m.defaultOn]));
  store.setSetting('modules', { ...current, [moduleId]: on });
  return true;
}

/** The children a Parent persona is linked to (§10 — multi-child families). */
export function linkedChildren() {
  const id = currentIdentity();
  if (id?.kind === 'parent') return id.childIds.map((cid) => studentById(cid)).filter(Boolean);
  if (id?.kind === 'student') return [studentById(id.studentId)].filter(Boolean);
  return [];
}
