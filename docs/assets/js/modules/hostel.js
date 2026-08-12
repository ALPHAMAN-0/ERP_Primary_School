/**
 * Hostel / Boarding — ships switched OFF by default (§4).
 *
 * Blocks, rooms, and bed allocation. Allocation respects the gender of the
 * block, which is the one constraint that cannot be got wrong.
 */

import {
  html, icon, card, table, badge, avatar, emptyState, progressBar, downloadFile, toCsv, toast,
} from '../core/ui.js';
import { hostelAllocation, HOSTEL_BLOCKS } from '../core/facilities.js';
import { taka } from '../core/domain.js';
import { FEE_HEADS } from '../core/spec.js';

const state = { blockId: null };

export default {
  id: 'hostel',
  title: 'Hostel',
  module: 'hostel',

  render(ctx) {
    if (ctx.query.block) state.blockId = ctx.query.block;
    const { rooms, allocation, boarders } = hostelAllocation();
    const monthlyFee = FEE_HEADS.find((f) => f.id === 'HST')?.amount || 0;

    const blocks = HOSTEL_BLOCKS.map((b) => {
      const blockRooms = rooms.filter((r) => r.blockId === b.id);
      const occupied = blockRooms.reduce((s, r) => s + allocation.get(r.id).length, 0);
      const capacity = blockRooms.reduce((s, r) => s + r.capacity, 0);
      return { block: b, rooms: blockRooms, occupied, capacity };
    });

    const totalCapacity = blocks.reduce((s, b) => s + b.capacity, 0);
    const activeBlock = state.blockId ? blocks.find((b) => b.block.id === state.blockId) : null;

    return {
      title: 'Hostel & Boarding',
      sub: 'Blocks, rooms, and bed allocation. Ships switched off by default (§4).',
      body: html`
        <div class="grid g-4 mb-3">
          <div class="stat"><div class="stat-label">Boarders</div><div class="stat-value">${boarders.length}</div></div>
          <div class="stat"><div class="stat-label">Capacity</div><div class="stat-value">${totalCapacity}</div>
            <div class="stat-meta">${rooms.length} rooms across ${HOSTEL_BLOCKS.length} blocks</div></div>
          <div class="stat"><div class="stat-label">Occupancy</div><div class="stat-value">${((boarders.length / totalCapacity) * 100).toFixed(0)}%</div>
            <div class="mt-1">${progressBar((boarders.length / totalCapacity) * 100, 'ok')}</div></div>
          <div class="stat"><div class="stat-label">Monthly hostel revenue</div><div class="stat-value">${taka(boarders.length * monthlyFee)}</div>
            <div class="stat-meta">${taka(monthlyFee)} per boarder</div></div>
        </div>

        ${activeBlock ? html`
          <button class="btn btn-sm mb-3" id="h-back">${icon('arrowLeft')} All blocks</button>
          ${card({
            title: activeBlock.block.name,
            sub: `${activeBlock.occupied} of ${activeBlock.capacity} beds occupied · ${activeBlock.block.gender} block`,
            actions: html`<button class="btn btn-sm" id="h-csv">${icon('download')} CSV</button>`,
            flush: true,
            body: table(activeBlock.rooms, [
              { key: 'number', label: 'Room', render: (r) => html`<strong class="mono">${r.number}</strong><div class="cell-sub">Floor ${r.floor}</div>` },
              {
                key: 'occupants', label: 'Occupants',
                render: (r) => {
                  const list = allocation.get(r.id);
                  if (!list.length) return html`<span class="muted">Vacant</span>`;
                  return html`
                    <div class="row wrap" style="gap:6px">
                      ${list.map((s) => html`
                        <a class="row" href="#/student/${s.id}" style="gap:5px;color:inherit">
                          ${avatar(s.name, s.id, 'sm')}
                          <span class="xsmall">${s.name.split(' ')[0]} <span class="muted">${s.gradeName.replace('Class ', 'C')}</span></span>
                        </a>`)}
                    </div>`;
                },
              },
              {
                key: 'occ', label: 'Beds', align: 'right', width: '140px',
                render: (r) => {
                  const n = allocation.get(r.id).length;
                  return html`
                    <div class="row" style="gap:8px;justify-content:flex-end">
                      <span class="num">${n}/${r.capacity}</span>
                      <div style="width:52px">${progressBar((n / r.capacity) * 100, n === r.capacity ? 'warn' : 'ok')}</div>
                    </div>`;
                },
              },
            ], { compact: true }),
          })}`
        : html`
          <div class="grid g-3">
            ${blocks.map((b) => card({
              title: b.block.name,
              sub: `${b.block.floors} floors · ${b.rooms.length} rooms · ${b.block.gender} only`,
              actions: html`<button class="btn btn-sm" data-block="${b.block.id}">Open</button>`,
              body: html`
                <div class="row between mb-2">
                  <span class="dim small">Beds occupied</span>
                  <strong>${b.occupied} / ${b.capacity}</strong>
                </div>
                ${progressBar((b.occupied / b.capacity) * 100, b.occupied / b.capacity > 0.9 ? 'warn' : 'ok')}
                <div class="row between mt-3">
                  <span class="dim small">Vacant beds</span>
                  <strong>${b.capacity - b.occupied}</strong>
                </div>
                <div class="row between mt-1">
                  <span class="dim small">Rooms at capacity</span>
                  <strong>${b.rooms.filter((r) => allocation.get(r.id).length >= r.capacity).length}</strong>
                </div>`,
            }))}
          </div>`}`,
    };
  },

  mount(root) {
    root.querySelectorAll('[data-block]').forEach((b) =>
      b.addEventListener('click', () => {
        state.blockId = b.dataset.block;
        window.ERP.repaint();
      }));

    root.querySelector('#h-back')?.addEventListener('click', () => {
      state.blockId = null;
      window.ERP.repaint();
    });

    root.querySelector('#h-csv')?.addEventListener('click', () => {
      const { rooms, allocation } = hostelAllocation();
      const rows = [];
      for (const r of rooms.filter((x) => x.blockId === state.blockId)) {
        for (const s of allocation.get(r.id)) rows.push({ room: r, student: s });
      }
      downloadFile(`hostel-${state.blockId}.csv`, toCsv(rows, [
        { label: 'Room', value: (x) => x.room.number },
        { label: 'Floor', value: (x) => x.room.floor },
        { label: 'Student ID', value: (x) => x.student.id },
        { label: 'Name', value: (x) => x.student.name },
        { label: 'Class', value: (x) => x.student.gradeName },
        { label: 'Guardian Phone', value: (x) => x.student.guardianPhone },
      ]), 'text/csv');
      toast('Allocation exported');
    });
  },
};
