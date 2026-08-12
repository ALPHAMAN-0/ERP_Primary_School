/**
 * Transport — ships switched OFF by default (§4).
 *
 * Routes, vehicles, stoppages and rider assignments. When this module is on,
 * the transport fee head becomes billable and appears on every rider's ledger
 * automatically (see domain.feeScheduleFor).
 */

import {
  html, icon, card, table, badge, avatar, emptyState, progressBar, barChart,
  downloadFile, toCsv, toast, seriesColor, legend,
} from '../core/ui.js';
import { allStaff } from '../core/data.js';
import { allRoutes, routeById, routeRoster } from '../core/facilities.js';
import { taka, fmtDate } from '../core/domain.js';
import { hash } from '../core/rng.js';

const state = { routeId: null };

function driverFor(route) {
  const drivers = allStaff().filter((s) => s.designationId === 'DRVR');
  if (!drivers.length) return null;
  return drivers[hash(`driver|${route.id}`) % drivers.length];
}

function overview() {
  const routes = allRoutes();
  const rosters = routes.map((r) => ({ route: r, riders: routeRoster(r.id), driver: driverFor(r) }));
  const totalRiders = rosters.reduce((s, r) => s + r.riders.length, 0);
  const capacity = routes.reduce((s, r) => s + r.vehicle.capacity, 0);
  const revenue = rosters.reduce((s, r) => s + r.riders.length * r.route.fare, 0);

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Routes</div><div class="stat-value">${routes.length}</div></div>
      <div class="stat"><div class="stat-label">Riders</div><div class="stat-value">${totalRiders.toLocaleString()}</div></div>
      <div class="stat"><div class="stat-label">Fleet utilisation</div><div class="stat-value">${((totalRiders / capacity) * 100).toFixed(0)}%</div>
        <div class="mt-1">${progressBar((totalRiders / capacity) * 100, totalRiders / capacity > 0.95 ? 'bad' : 'ok')}</div></div>
      <div class="stat"><div class="stat-label">Monthly revenue</div><div class="stat-value">${taka(revenue)}</div>
        <div class="stat-meta">billed with tuition</div></div>
    </div>

    ${card({
      title: 'Routes',
      sub: 'Click a route to see its stoppages and rider list',
      flush: true,
      actions: html`<button class="btn btn-sm" id="tr-csv">${icon('download')} CSV</button>`,
      body: table(rosters, [
        {
          key: 'name', label: 'Route',
          render: (r) => html`
            <div class="cell-main">${r.route.name}</div>
            <div class="cell-sub">${r.route.stops.length} stoppages · ৳${r.route.fare}/month</div>`,
        },
        {
          key: 'vehicle', label: 'Vehicle',
          render: (r) => html`<div class="cell-main mono xsmall">${r.route.vehicle.reg}</div><div class="cell-sub">${r.route.vehicle.model}</div>`,
        },
        { key: 'driver', label: 'Driver', render: (r) => (r.driver ? html`<div class="cell-main">${r.driver.name}</div><div class="cell-sub mono">${r.driver.phone}</div>` : html`<span class="muted">Unassigned</span>`) },
        { key: 'time', label: 'Departs', align: 'center', render: (r) => html`<span class="mono">${r.route.departure}</span><div class="cell-sub">arr. ${r.route.arrival}</div>` },
        {
          key: 'load', label: 'Load', align: 'right', width: '170px',
          render: (r) => {
            const pct = (r.riders.length / r.route.vehicle.capacity) * 100;
            return html`
              <div class="row" style="gap:8px;justify-content:flex-end">
                <span class="num">${r.riders.length}/${r.route.vehicle.capacity}</span>
                <div style="width:66px">${progressBar(pct, pct > 95 ? 'bad' : pct > 80 ? 'warn' : 'ok')}</div>
              </div>`;
          },
        },
        {
          key: 'act', label: '', align: 'right',
          render: (r) => html`<button class="btn btn-sm" data-route="${r.route.id}">Open</button>`,
        },
      ], { compact: true }),
    })}`;
}

function routeDetail(route) {
  const riders = routeRoster(route.id);
  const driver = driverFor(route);
  const byStop = {};
  for (const r of riders) byStop[r.stop] = (byStop[r.stop] || 0) + 1;

  return html`
    <button class="btn btn-sm mb-3" id="tr-back">${icon('arrowLeft')} All routes</button>

    <div class="grid g-sidebar mb-3">
      ${card({
        title: route.name,
        sub: `${riders.length} riders · ${route.vehicle.capacity}-seat ${route.vehicle.model}`,
        body: html`
          <dl class="dl">
            <dt>Vehicle</dt><dd class="mono">${route.vehicle.reg}</dd>
            <dt>Model</dt><dd>${route.vehicle.model}</dd>
            <dt>Capacity</dt><dd>${route.vehicle.capacity} seats</dd>
            <dt>Driver</dt><dd>${driver ? html`${driver.name} · <span class="mono">${driver.phone}</span>` : 'Unassigned'}</dd>
            <dt>Departure</dt><dd class="mono">${route.departure}</dd>
            <dt>Arrival</dt><dd class="mono">${route.arrival}</dd>
            <dt>Monthly fare</dt><dd>${taka(route.fare)}</dd>
            <dt>Monthly revenue</dt><dd><strong>${taka(riders.length * route.fare)}</strong></dd>
          </dl>`,
      })}
      ${card({
        title: 'Stoppages',
        sub: 'In pick-up order',
        body: html`
          <div class="timeline">
            ${route.stops.map((stop, i) => html`
              <div class="tl-item">
                <div class="tl-text strong">${stop}</div>
                <div class="tl-time">
                  ${i === route.stops.length - 1 ? 'Campus arrival' : `${byStop[stop] || 0} student${(byStop[stop] || 0) === 1 ? '' : 's'} boarding`}
                </div>
              </div>`)}
          </div>`,
      })}
    </div>

    ${card({
      title: 'Rider list',
      flush: true,
      actions: html`<button class="btn btn-sm" id="tr-roster-csv">${icon('download')} CSV</button>`,
      body: table(riders, [
        {
          key: 'name', label: 'Student',
          render: (s) => html`
            <a class="row" href="#/student/${s.id}" style="gap:8px;color:inherit">
              ${avatar(s.name, s.id, 'sm')}
              <div style="min-width:0"><div class="cell-main truncate">${s.name}</div><div class="cell-sub mono">${s.id}</div></div>
            </a>`,
        },
        { key: 'class', label: 'Class', render: (s) => `${s.gradeName} ${s.sectionName}` },
        { key: 'stop', label: 'Boarding point', render: (s) => badge(s.stop, 'outline') },
        { key: 'phone', label: 'Guardian', render: (s) => html`<span class="mono xsmall">${s.guardianPhone}</span>` },
      ], { compact: true, emptyMessage: 'No students assigned to this route' }),
    })}`;
}

export default {
  id: 'transport',
  title: 'Transport',
  module: 'transport',

  render(ctx) {
    if (ctx.query.route) state.routeId = ctx.query.route;
    const route = state.routeId ? routeById(state.routeId) : null;
    return {
      title: 'Transport',
      sub: 'Routes, vehicles, and rider assignments. Ships switched off by default (§4).',
      body: route ? routeDetail(route) : overview(),
    };
  },

  mount(root) {
    root.querySelectorAll('[data-route]').forEach((b) =>
      b.addEventListener('click', () => {
        state.routeId = b.dataset.route;
        window.ERP.repaint();
      }));

    root.querySelector('#tr-back')?.addEventListener('click', () => {
      state.routeId = null;
      window.ERP.repaint();
    });

    root.querySelector('#tr-csv')?.addEventListener('click', () => {
      const rows = allRoutes().map((r) => ({ r, riders: routeRoster(r.id), driver: driverFor(r) }));
      downloadFile(`transport-routes.csv`, toCsv(rows, [
        { label: 'Route', value: (x) => x.r.name },
        { label: 'Vehicle', value: (x) => x.r.vehicle.reg },
        { label: 'Capacity', value: (x) => x.r.vehicle.capacity },
        { label: 'Riders', value: (x) => x.riders.length },
        { label: 'Driver', value: (x) => x.driver?.name || '' },
        { label: 'Fare', value: (x) => x.r.fare },
        { label: 'Monthly Revenue', value: (x) => x.riders.length * x.r.fare },
      ]), 'text/csv');
      toast('Routes exported');
    });

    root.querySelector('#tr-roster-csv')?.addEventListener('click', () => {
      const route = routeById(state.routeId);
      const riders = routeRoster(route.id);
      downloadFile(`transport-${route.id}-riders.csv`, toCsv(riders, [
        { label: 'Student ID', value: (s) => s.id },
        { label: 'Name', value: (s) => s.name },
        { label: 'Class', value: (s) => s.gradeName },
        { label: 'Section', value: (s) => s.sectionName },
        { label: 'Boarding Point', value: (s) => s.stop },
        { label: 'Guardian Phone', value: (s) => s.guardianPhone },
      ]), 'text/csv');
      toast('Rider list exported');
    });
  },
};
