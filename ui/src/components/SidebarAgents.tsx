import { useMemo, useState } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { heartbeatsApi } from "../api/heartbeats";
import { SIDEBAR_SCROLL_RESET_STATE } from "../lib/navigation-scroll";
import { queryKeys } from "../lib/queryKeys";
import { cn, agentRouteRef, agentUrl } from "../lib/utils";
import { useAgentOrder } from "../hooks/useAgentOrder";
import { AgentIcon } from "./AgentIconPicker";
import { BudgetSidebarMarker } from "./BudgetSidebarMarker";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Agent } from "@paperclipai/shared";
export function SidebarAgents() {
  const [open, setOpen] = useState(true);
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const location = useLocation();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    }
    return counts;
  }, [liveRuns]);

  const visibleAgents = useMemo(() => {
    const filtered = (agents ?? []).filter(
      (a: Agent) => a.status !== "terminated"
    );
    return filtered;
  }, [agents]);
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const { orderedAgents } = useAgentOrder({
    agents: visibleAgents,
    companyId: selectedCompanyId,
    userId: currentUserId,
  });

  // Build org tree from flat agents list
  const orgTree = useMemo(() => {
    const byId = new Map<string, SidebarNode>();
    for (const a of orderedAgents) byId.set(a.id, { agent: a, children: [] });
    const roots: SidebarNode[] = [];
    for (const a of orderedAgents) {
      const node = byId.get(a.id)!;
      const parentId = a.reportsTo as string | null | undefined;
      if (parentId && byId.has(parentId)) {
        byId.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }, [orderedAgents]);

  const agentMatch = location.pathname.match(/^\/(?:[^/]+\/)?agents\/([^/]+)(?:\/([^/]+))?/);
  const activeAgentId = agentMatch?.[1] ?? null;
  const activeTab = agentMatch?.[2] ?? null;


  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group">
        <div className="flex items-center px-3 py-1.5">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1 min-w-0">
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100",
                open && "rotate-90"
              )}
            />
            <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
              Agents
            </span>
          </CollapsibleTrigger>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openNewAgent();
            }}
            className="flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="New agent"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col mt-0.5">
          {orgTree.map((root) => (
            <div key={root.agent.id}>
              {/* Root agent (CEO) rendered without tree connectors */}
              <NavLink
                to={activeTab ? `${agentUrl(root.agent)}/${activeTab}` : agentUrl(root.agent)}
                state={SIDEBAR_SCROLL_RESET_STATE}
                onClick={() => { if (isMobile) setSidebarOpen(false); }}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-0.5 text-[13px] font-medium transition-colors",
                  activeAgentId === agentRouteRef(root.agent)
                    ? "bg-accent text-foreground"
                    : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <AgentIcon icon={root.agent.icon} className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{root.agent.name}</span>
              </NavLink>
              {/* C-level children without connectors, their reports with tree */}
              {root.children.map((child) => (
                <SidebarOrgNode
                  key={child.agent.id}
                  node={child}
                  depth={0}
                  prefix=""
                  isLast={true}
                  activeAgentId={activeAgentId}
                  activeTab={activeTab}
                  liveCountByAgent={liveCountByAgent}
                  isMobile={isMobile}
                  setSidebarOpen={setSidebarOpen}
                />
              ))}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

type SidebarNode = { agent: Agent; children: SidebarNode[] };

function SidebarOrgNode({
  node,
  depth,
  prefix,
  isLast,
  activeAgentId,
  activeTab,
  liveCountByAgent,
  isMobile,
  setSidebarOpen,
}: {
  node: SidebarNode;
  depth: number;
  prefix: string;
  isLast: boolean;
  activeAgentId: string | null;
  activeTab: string | null;
  liveCountByAgent: Map<string, number>;
  isMobile: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  const { agent } = node;
  const runCount = liveCountByAgent.get(agent.id) ?? 0;
  const connector = depth === 0 ? "" : isLast ? "└─ " : "├─ ";
  const childPrefix = depth === 0 ? "" : prefix + (isLast ? "   " : "│  ");

  return (
    <>
      <NavLink
        to={activeTab ? `${agentUrl(agent)}/${activeTab}` : agentUrl(agent)}
        state={SIDEBAR_SCROLL_RESET_STATE}
        onClick={() => { if (isMobile) setSidebarOpen(false); }}
        className={cn(
          "flex items-center gap-1 px-3 py-0.5 text-[13px] font-medium transition-colors",
          activeAgentId === agentRouteRef(agent)
            ? "bg-accent text-foreground"
            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
        )}
      >
        {depth > 0 && (
          <span className="text-muted-foreground/40 font-mono text-[11px] whitespace-pre select-none shrink-0 leading-none">
            {prefix}{connector}
          </span>
        )}
        <AgentIcon icon={agent.icon} className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 truncate">{agent.name}</span>
        {(agent.pauseReason === "budget" || runCount > 0) && (
          <span className="ml-auto flex items-center gap-1.5 shrink-0">
            {agent.pauseReason === "budget" ? (
              <BudgetSidebarMarker title="Agent paused by budget" />
            ) : null}
            {runCount > 0 ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                  {runCount} live
                </span>
              </>
            ) : null}
          </span>
        )}
      </NavLink>
      {node.children.map((child, i) => (
        <SidebarOrgNode
          key={child.agent.id}
          node={child}
          depth={depth + 1}
          prefix={childPrefix}
          isLast={i === node.children.length - 1}
          activeAgentId={activeAgentId}
          activeTab={activeTab}
          liveCountByAgent={liveCountByAgent}
          isMobile={isMobile}
          setSidebarOpen={setSidebarOpen}
        />
      ))}
    </>
  );
}
