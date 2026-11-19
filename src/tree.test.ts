import { describe, it, expect } from 'vitest'
import { emptyReq, type Req } from './model'
import { buildTree } from './tree'

const r = (id: string, type: string, parent = ''): Req => ({ ...emptyReq(id), type, parent, statement: id })

describe('buildTree', () => {
  const rows = [
    r('BR-1', 'Business', 'Grow retention'),
    r('SR-1', 'Stakeholder', 'BR-1'),
    r('FR-1', 'Functional', 'SR-1'),
    r('FR-2', 'Functional', 'sr-1, BR-1'),        // two parents, lower-case ID
    r('TR-1', 'Transition', 'SR-1'),
    r('NF-1', 'Non-functional', ''),              // orphan
    r('BR-2', 'Business', 'FR-1'),                // wrong level
  ]
  const t = buildTree(rows)
  it('roots are business requirements without parents', () => expect(t.roots.map(n => n.req.id)).toEqual(['BR-1']))
  it('nests levels', () => expect(t.roots[0].children.map(n => n.req.id)).toEqual(['SR-1', 'FR-2']))
  it('stakeholder children ordered by level', () => expect(t.roots[0].children[0].children.map(n => n.req.id)).toEqual(['FR-1', 'FR-2', 'TR-1']))
  it('multi-parent node remembers the other parent', () => expect(t.roots[0].children[1].extraParents).toEqual(['SR-1']))
  it('orphans', () => expect(t.orphans.map(n => n.req.id)).toEqual(['NF-1']))
  it('level issue', () => expect(t.issues.some(i => i.id === 'BR-2' && i.kind === 'level')).toBe(true))
  it('children/parents lookups', () => {
    expect(t.childrenOf('SR-1').map(x => x.id).sort()).toEqual(['FR-1', 'FR-2', 'TR-1'])
    expect(t.parentsOf('FR-2').map(x => x.id)).toEqual(['SR-1', 'BR-1'])
  })
  it('survives cycles', () => {
    const c = buildTree([r('A', 'Functional', 'B'), r('B', 'Functional', 'A')])
    expect(c.orphans.length).toBeGreaterThan(0)
    expect(c.issues.some(i => i.kind === 'cycle')).toBe(true)
  })
})
