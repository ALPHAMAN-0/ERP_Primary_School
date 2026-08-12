/**
 * Admissions (§8).
 *
 * The interesting part of this screen is the ID allocator. Every student gets a
 * permanent `YYMMSSSS` identifier at admission and it is never reused — not
 * after graduation, not after withdrawal. The serial is scoped to the admission
 * month, so the allocator has to know the highest serial already issued that
 * month, including students created earlier in this session.
 *
 * The form previews the ID it will assign before you submit, which is how the
 * office actually works: the number goes on the paper file first.
 */

import {
  html, icon, card, table, badge, avatar, emptyState, toast, modal, closeModal, toStr,
} from '../core/ui.js';
import * as store from '../core/store.js';
import * as clock from '../core/clock.js';
import * as router from '../core/router.js';
import { allStudents, usedSerialsIn, studentsInClass, invalidate } from '../core/data.js';
import { makeStudentId, parseStudentId, fmtDate, ageFrom, toIsoDate, MONTHS, WAIVERS } from '../core/domain.js';
import {
  GRADES, GROUPS, CLASS_LIST, STUDENT_ID, sectionsFor, subjectsFor, ACADEMIC_YEAR,
} from '../core/spec.js';
import { AREAS, OCCUPATIONS, RELIGIONS, BLOOD_GROUPS } from '../core/names.js';

/** Compute the ID the next admission in the current month would receive. */
function previewId(date) {
  const yymm = `${String(date.getFullYear() % 100).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const used = usedSerialsIn(yymm);
  return { yymm, serial: used + 1, id: makeStudentId(date, used + 1), used };
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function admissionForm() {
  const today = clock.today();
  const preview = previewId(today);
  const recent = store.getAdmissions().slice(0, 8);

  return html`
    <div class="grid g-sidebar mb-3">
      ${card({
        title: 'New admission',
        sub: 'Every field marked with an asterisk is required by the office register.',
        body: html`
          <form id="adm-form" autocomplete="off">
            <div class="label mb-1">Student</div>
            <div class="form-grid" style="grid-template-columns:1fr 1fr">
              <div class="field">
                <label class="label" for="f-name">Name in English<span class="req">*</span></label>
                <input class="input" id="f-name" name="name" required placeholder="Rakib Hossain">
              </div>
              <div class="field">
                <label class="label" for="f-nameBn">নাম (বাংলা)<span class="req">*</span></label>
                <input class="input bn" id="f-nameBn" name="nameBn" required placeholder="রাকিব হোসেন">
              </div>
              <div class="field">
                <label class="label" for="f-dob">Date of birth<span class="req">*</span></label>
                <input class="input" type="date" id="f-dob" name="dob" required max="${clock.todayIso()}">
              </div>
              <div class="field">
                <label class="label" for="f-gender">Gender<span class="req">*</span></label>
                <select class="select" id="f-gender" name="gender"><option>Male</option><option>Female</option></select>
              </div>
              <div class="field">
                <label class="label" for="f-religion">Religion</label>
                <select class="select" id="f-religion" name="religion">
                  ${RELIGIONS.map((r) => html`<option value="${r.name}">${r.name}</option>`)}
                </select>
              </div>
              <div class="field">
                <label class="label" for="f-blood">Blood group</label>
                <select class="select" id="f-blood" name="bloodGroup">
                  <option value="">Unknown</option>
                  ${BLOOD_GROUPS.map((b) => html`<option>${b}</option>`)}
                </select>
              </div>
            </div>

            <hr class="divider">
            <div class="label mb-1">Placement</div>
            <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr">
              <div class="field">
                <label class="label" for="f-grade">Class<span class="req">*</span></label>
                <select class="select" id="f-grade" name="gradeId">
                  ${GRADES.map((g) => html`<option value="${g.id}">${g.name}</option>`)}
                </select>
              </div>
              <div class="field">
                <label class="label" for="f-section">Section<span class="req">*</span></label>
                <select class="select" id="f-section" name="sectionId"></select>
              </div>
              <div class="field">
                <label class="label" for="f-waiver">Fee waiver</label>
                <select class="select" id="f-waiver" name="waiverId">
                  ${WAIVERS.map((w) => html`<option value="${w.id}">${w.name}${w.percent ? ` (${w.percent}%)` : ''}</option>`)}
                </select>
              </div>
            </div>
            <div id="f-optional-wrap" class="mt-2" hidden>
              <div class="field">
                <label class="label" for="f-optional">Optional (4th) subject</label>
                <select class="select" id="f-optional" name="optionalSubject"></select>
                <div class="hint">Grade points above 2.00 in this subject are added to the GPA as a bonus (§7).</div>
              </div>
            </div>

            <hr class="divider">
            <div class="label mb-1">Guardian (§10 — a parent account can link several children)</div>
            <div class="form-grid" style="grid-template-columns:1fr 1fr">
              <div class="field">
                <label class="label" for="f-father">Father's name<span class="req">*</span></label>
                <input class="input" id="f-father" name="father" required placeholder="Md. Kamal Hossain">
              </div>
              <div class="field">
                <label class="label" for="f-mother">Mother's name<span class="req">*</span></label>
                <input class="input" id="f-mother" name="mother" required placeholder="Mst. Rahima Begum">
              </div>
              <div class="field">
                <label class="label" for="f-occupation">Father's occupation</label>
                <select class="select" id="f-occupation" name="fatherOccupation">
                  ${OCCUPATIONS.map((o) => html`<option>${o}</option>`)}
                </select>
              </div>
              <div class="field">
                <label class="label" for="f-phone">Guardian phone<span class="req">*</span></label>
                <input class="input" id="f-phone" name="guardianPhone" required placeholder="01712345678"
                       pattern="01[3-9][0-9]{8}">
                <div class="hint">11 digits, starting 01. This becomes the guardian's login identifier.</div>
              </div>
              <div class="field">
                <label class="label" for="f-nid">Guardian NID</label>
                <input class="input" id="f-nid" name="guardianNid" placeholder="1234567890">
              </div>
              <div class="field">
                <label class="label" for="f-area">Area</label>
                <select class="select" id="f-area" name="area">
                  ${AREAS.map((a) => html`<option>${a}</option>`)}
                </select>
              </div>
              <div class="field" style="grid-column:span 2">
                <label class="label" for="f-address">Full address<span class="req">*</span></label>
                <input class="input" id="f-address" name="address" required placeholder="House 12, Road 3, Zindabazar">
              </div>
            </div>

            <div class="row mt-3" style="gap:8px">
              <button type="submit" class="btn btn-primary">${icon('plus')} Admit student</button>
              <button type="button" class="btn" id="adm-demo">${icon('zap')} Fill with sample data</button>
              <button type="reset" class="btn btn-ghost">Clear</button>
            </div>
          </form>`,
      })}

      <div class="col" style="gap:14px">
        ${card({
          title: 'Identifier to be issued',
          sub: `Format ${STUDENT_ID.format} — ${STUDENT_ID.description}`,
          body: html`
            <div class="center" style="padding:6px 0 12px">
              <div class="mono" style="font-size:30px;font-weight:700;letter-spacing:.06em" id="id-preview">${preview.id}</div>
              <div class="xsmall muted mt-1">Reserved on submit</div>
            </div>
            <div class="row" style="gap:0;justify-content:center;margin-bottom:14px">
              ${[
                { part: preview.id.slice(0, 2), label: 'Year', color: 'var(--series-1)' },
                { part: preview.id.slice(2, 4), label: 'Month', color: 'var(--series-2)' },
                { part: preview.id.slice(4), label: 'Serial', color: 'var(--series-3)' },
              ].map((seg) => html`
                <div class="center" style="padding:0 10px">
                  <div class="mono strong" style="font-size:16px;color:${seg.color}">${seg.part}</div>
                  <div class="xsmall muted">${seg.label}</div>
                </div>`)}
            </div>
            <dl class="dl">
              <dt>Admission month</dt><dd>${MONTHS[clock.today().getMonth()]} ${clock.today().getFullYear()}</dd>
              <dt>Issued so far</dt><dd>${preview.used.toLocaleString()} this month</dd>
              <dt>Remaining</dt><dd>${(STUDENT_ID.monthlyCapacity - preview.used).toLocaleString()} of ${STUDENT_ID.monthlyCapacity.toLocaleString()}</dd>
            </dl>
            <p class="hint mt-2">
              Serials never rewind. Withdrawing or graduating a student does not free their number,
              which is what makes the ID safe to print on certificates (§8).
            </p>`,
        })}

        ${card({
          title: 'Admitted in this session',
          sub: recent.length ? `${recent.length} record${recent.length === 1 ? '' : 's'}` : null,
          flush: Boolean(recent.length),
          body: recent.length
            ? table(recent, [
                {
                  key: 'name', label: 'Student',
                  render: (s) => html`
                    <a href="#/student/${s.id}" style="color:inherit">
                      <div class="cell-main truncate">${s.name}</div>
                      <div class="cell-sub mono">${s.id}</div>
                    </a>`,
                },
                { key: 'class', label: 'Class', render: (s) => html`<span class="xsmall">${s.gradeName}<br>${s.sectionName}</span>` },
              ], { compact: true })
            : emptyState('plus', 'No admissions yet', 'Students you admit appear here and join the roster immediately.'),
        })}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Intake statistics
// ---------------------------------------------------------------------------

function intakeStats() {
  const byMonth = {};
  for (const s of allStudents()) {
    const parsed = parseStudentId(s.id);
    if (!parsed) continue;
    const key = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] || 0) + 1;
  }
  const rows = Object.entries(byMonth)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 24)
    .map(([key, count]) => {
      const [year, month] = key.split('-');
      return { key, label: `${MONTHS[Number(month) - 1]} ${year}`, count, prefix: `${String(year).slice(2)}${month}` };
    });

  return card({
    title: 'Admission history',
    sub: 'Every ID issued, grouped by its YYMM prefix — the same grouping the allocator uses',
    flush: true,
    body: table(rows, [
      { key: 'label', label: 'Admission month' },
      { key: 'prefix', label: 'ID prefix', render: (r) => html`<span class="mono">${r.prefix}****</span>` },
      { key: 'count', label: 'Students admitted', align: 'right', render: (r) => r.count.toLocaleString() },
      {
        key: 'cap', label: 'Monthly capacity used', align: 'right',
        render: (r) => html`<span class="num">${((r.count / STUDENT_ID.monthlyCapacity) * 100).toFixed(2)}%</span>`,
      },
    ], { compact: true }),
    foot: `Capacity is ${STUDENT_ID.monthlyCapacity.toLocaleString()} admissions per month. At the current intake the format has decades of headroom.`,
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'form', label: 'New Admission' },
  { id: 'history', label: 'Admission History' },
];

const state = { tab: 'form' };

export default {
  id: 'admissions',
  title: 'Admissions',
  module: 'admissions',

  render() {
    return {
      title: 'Admissions',
      sub: 'Enrol a student and issue a permanent identifier that will never be reused (§8).',
      body: html`
        <div class="tabs mb-3">
          ${TABS.map((t) => html`<button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`)}
        </div>
        ${state.tab === 'history' ? intakeStats() : admissionForm()}`,
    };
  },

  mount(root) {
    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        window.ERP.repaint();
      }));

    const form = root.querySelector('#adm-form');
    if (!form) return;

    const gradeSel = form.querySelector('#f-grade');
    const sectionSel = form.querySelector('#f-section');
    const optionalWrap = form.querySelector('#f-optional-wrap');
    const optionalSel = form.querySelector('#f-optional');

    const syncPlacement = () => {
      const gradeId = gradeSel.value;
      const sections = sectionsFor(gradeId);
      sectionSel.innerHTML = sections
        .map((s) => `<option value="${s.id}">${s.name}</option>`)
        .join('');

      const groupId = sections[0]?.group || null;
      const subjects = subjectsFor(gradeId, groupId);
      const optionals = subjects.filter((s) => s.optional);
      if (optionals.length) {
        optionalWrap.hidden = false;
        optionalSel.innerHTML = optionals.map((s) => `<option value="${s.code}">${s.name}</option>`).join('');
      } else {
        optionalWrap.hidden = true;
        optionalSel.innerHTML = '';
      }
    };

    const syncOptionalForSection = () => {
      const cls = CLASS_LIST.find((c) => c.key === `${gradeSel.value}-${sectionSel.value}`);
      if (!cls) return;
      const optionals = subjectsFor(cls.gradeId, cls.groupId).filter((s) => s.optional);
      if (optionals.length) {
        optionalWrap.hidden = false;
        optionalSel.innerHTML = optionals.map((s) => `<option value="${s.code}">${s.name}</option>`).join('');
      } else {
        optionalWrap.hidden = true;
      }
    };

    gradeSel.addEventListener('change', syncPlacement);
    sectionSel.addEventListener('change', syncOptionalForSection);
    syncPlacement();

    root.querySelector('#adm-demo')?.addEventListener('click', () => {
      const samples = [
        { name: 'Tahmid Rahman', nameBn: 'তাহমিদ রহমান', gender: 'Male', father: 'Md. Mahbubur Rahman', mother: 'Mst. Shirin Akter' },
        { name: 'Nusrat Jahan', nameBn: 'নুসরাত জাহান', gender: 'Female', father: 'Md. Anisul Islam', mother: 'Mst. Ruma Begum' },
        { name: 'Arnab Das', nameBn: 'অর্ণব দাস', gender: 'Male', father: 'Sujit Das', mother: 'Mitali Das' },
      ];
      const s = samples[Math.floor(Math.random() * samples.length)];
      form.querySelector('#f-name').value = s.name;
      form.querySelector('#f-nameBn').value = s.nameBn;
      form.querySelector('#f-gender').value = s.gender;
      form.querySelector('#f-father').value = s.father;
      form.querySelector('#f-mother').value = s.mother;
      form.querySelector('#f-phone').value = `017${String(Math.floor(10000000 + Math.random() * 89999999))}`;
      form.querySelector('#f-nid').value = String(Math.floor(1000000000 + Math.random() * 8999999999));
      form.querySelector('#f-address').value = 'House 24, Road 6, Zindabazar, Sylhet';
      const dob = new Date(clock.today());
      dob.setFullYear(dob.getFullYear() - 6);
      form.querySelector('#f-dob').value = toIsoDate(dob);
      toast('Sample data filled', 'Adjust anything, then press Admit student.');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());

      if (!/^01[3-9]\d{8}$/.test(data.guardianPhone)) {
        toast('Check the guardian phone', 'It must be 11 digits starting with 01.', 'bad');
        form.querySelector('#f-phone').classList.add('invalid');
        return;
      }

      const date = clock.today();
      const yymm = `${String(date.getFullYear() % 100).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}`;
      const serial = store.nextAdmissionSerial(yymm, usedSerialsIn(yymm));
      const id = makeStudentId(date, serial);

      const cls = CLASS_LIST.find((c) => c.key === `${data.gradeId}-${data.sectionId}`) || CLASS_LIST[0];
      const roll = studentsInClass(cls.key).length + 1;

      const student = {
        id,
        roll,
        name: data.name.trim(),
        nameBn: data.nameBn.trim(),
        gender: data.gender,
        dob: data.dob,
        religion: data.religion,
        religionBn: RELIGIONS.find((r) => r.name === data.religion)?.nameBn || '',
        bloodGroup: data.bloodGroup || '—',
        gradeId: cls.gradeId,
        gradeName: cls.gradeName,
        sectionId: cls.sectionId,
        sectionName: cls.sectionName,
        classKey: cls.key,
        groupId: cls.groupId,
        schoolSection: cls.schoolSection,
        level: cls.level,
        father: data.father.trim(),
        fatherBn: data.father.trim(),
        fatherOccupation: data.fatherOccupation,
        mother: data.mother.trim(),
        motherBn: data.mother.trim(),
        motherOccupation: 'Homemaker',
        guardianPhone: data.guardianPhone,
        guardianNid: data.guardianNid || '—',
        address: data.address.trim(),
        area: data.area,
        admittedOn: clock.todayIso(),
        status: 'Active',
        waiverId: data.waiverId,
        optionalSubject: data.optionalSubject || null,
        // New students start at the roster average rather than an extreme, so
        // their generated attendance and marks look plausible from day one.
        ability: 62,
        diligence: 0.91,
        wantsTransport: false,
        hostel: false,
        familyId: `FAM-${id}`,
        isNewAdmission: true,
      };

      store.addAdmission(student);
      invalidate();

      modal({
        title: 'Admission complete',
        body: html`
          <div class="center" style="padding:8px 0 16px">
            ${avatar(student.name, student.id, 'xl')}
            <h3 style="font-size:18px;font-weight:660;margin-top:10px">${student.name}</h3>
            <div class="bn dim">${student.nameBn}</div>
            <div class="mono mt-2" style="font-size:24px;font-weight:700;letter-spacing:.05em">${student.id}</div>
            <div class="xsmall muted">Permanent student identifier</div>
          </div>
          <dl class="dl">
            <dt>Class</dt><dd>${student.gradeName} — ${student.sectionName}</dd>
            <dt>Roll</dt><dd>${student.roll}</dd>
            <dt>Guardian</dt><dd>${student.father} · <span class="mono">${student.guardianPhone}</span></dd>
            <dt>Admitted</dt><dd>${fmtDate(student.admittedOn)}</dd>
          </dl>
          <p class="hint mt-3">
            The guardian can now sign in with this phone number. If they already have children here,
            the office links this student to the existing account rather than creating a second one (§10).
          </p>`,
        foot: html`
          <button class="btn" data-close>Admit another</button>
          <button class="btn btn-primary" id="go-profile">Open profile</button>`,
        onMount: (el) => el.querySelector('#go-profile').addEventListener('click', () => {
          closeModal();
          router.navigate(`student/${student.id}`);
        }),
      });

      form.reset();
      syncPlacement();
      const next = previewId(clock.today());
      const preview = root.querySelector('#id-preview');
      if (preview) preview.textContent = next.id;
    });
  },
};
