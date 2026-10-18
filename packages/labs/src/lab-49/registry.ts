import type { Tool } from '@mastra/core/tools';
import { orderTotalTool } from '../lab-11/tool.js';
import { formatCurrencyTool, inventoryLookupTool } from '../lab-13/tools.js';
import { AuditTrail, createSupportTools, RefundLedger } from '../lab-15/policy.js';

export type Risk = 'read-only' | 'personal-data' | 'side-effect';

export interface Candidate {
  /** The MCP tool name the façade would publish. */
  id: string;
  /** The lab whose Mastra tool this is. */
  source: string;
  risk: Risk;
  why: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: Tool<any, any, any, any>;
}

/**
 * Mastra tools built in earlier labs, classified by what calling them can do. The L15 tools get a fresh
 * ledger per registry, so a test can prove issue_refund never executed.
 */
export function createRegistry() {
  const ledger = new RefundLedger();
  const support = createSupportTools({ role: 'support-agent', actor: 'mcp-facade', audit: new AuditTrail(), ledger });
  const candidates: Candidate[] = [
    {
      id: 'calculate_order_total',
      source: 'lab-11',
      risk: 'read-only',
      why: 'pure calculation on the given line items',
      tool: orderTotalTool,
    },
    {
      id: 'inventory_lookup',
      source: 'lab-13',
      risk: 'read-only',
      why: 'reads the fixed product catalog',
      tool: inventoryLookupTool,
    },
    {
      id: 'format_currency',
      source: 'lab-13',
      risk: 'read-only',
      why: 'pure conversion with fixed rates',
      tool: formatCurrencyTool,
    },
    {
      id: 'lookup_order',
      source: 'lab-15',
      risk: 'personal-data',
      why: 'returns a customer’s order and payment amount',
      tool: support.lookupOrder!,
    },
    {
      id: 'issue_refund',
      source: 'lab-15',
      risk: 'side-effect',
      why: 'moves money and needs human approval',
      tool: support.issueRefund!,
    },
  ];
  return { candidates, ledger };
}
