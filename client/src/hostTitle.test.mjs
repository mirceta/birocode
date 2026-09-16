import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTabTitle, resolveTabTitle } from './hostTitle.js';

test('formatTabTitle: the LAN IP wins; else the host without its port; else the machine name', () => {
  assert.equal(formatTabTitle({ lanIp: '192.168.0.215', host: 'spacex:5099' }), '192.168.0.215');
  assert.equal(formatTabTitle({ host: 'spacex:5099' }), 'spacex');
  assert.equal(formatTabTitle({ host: '192.168.0.122:5099' }), '192.168.0.122');
  assert.equal(formatTabTitle({ host: '[::1]:5099' }), '[::1]');
  assert.equal(formatTabTitle({ host: '', machineName: 'WIN-QVH03HBBI3A' }), 'WIN-QVH03HBBI3A');
  assert.equal(formatTabTitle({}), 'Claude Web');
});

test('resolveTabTitle: shell meta first, then /api/health, then the location', async () => {
  const doc = { querySelector: (sel) => sel.includes('claudeweb-title') ? { getAttribute: () => '192.168.0.215' } : null };
  assert.equal(await resolveTabTitle({ doc }), '192.168.0.215');
  const noMeta = { querySelector: () => null };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ lanIp: '10.0.0.7', machineName: 'BOX' }) });
  assert.equal(await resolveTabTitle({ doc: noMeta, fetchImpl, location: { host: 'proxy.example:443' } }), '10.0.0.7');
  const fetchDown = async () => { throw new Error('offline'); };
  assert.equal(await resolveTabTitle({ doc: noMeta, fetchImpl: fetchDown, location: { host: 'proxy.example:443' } }), 'proxy.example');
});
