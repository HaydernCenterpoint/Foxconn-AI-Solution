import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow,
  Controls,
  Background,
  Panel,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge
} from '@xyflow/react';
import {
  ChevronLeft,
  Plus,
  Trash2,
  ArrowRightLeft,
  X,
  Gauge,
  Activity,
  Flame,
  CheckCircle,
  HelpCircle,
  ArrowUpRight,
  Server,
  Zap,
  Clock,
  Wifi,
  AlertTriangle
} from 'lucide-react';
import { useUiStore } from '../../../shared/store/ui.store';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import { linesApi, type ProductionLine } from '../services/lines.api';
import { machinesApi, type Machine } from '../../machines/services/machines.api';
import { getSimulationAll } from '../../simulation/services/simulation.api';
import { alarmsApi } from '../../alarms/services/alarms.api';
import { useDynamicTranslation } from '../../../shared/lib/translator';
import MachineNode from './nodes/MachineNode';

interface DiagramEditorProps {
  lineId: string;
  readOnly?: boolean;
  onClose?: () => void;
  hideSidebar?: boolean;
}

const calculateSequenceOrders = (connections: Record<string, string>, machines: any[]) => {
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  
  machines.forEach(m => {
    adj[m.id] = [];
    inDegree[m.id] = 0;
  });
  
  machines.forEach(m => {
    const targetVal = connections[m.id];
    if (targetVal) {
      const targets = typeof targetVal === 'string' ? targetVal.split(',') : [];
      targets.forEach(target => {
        if (target && adj[target]) {
          adj[m.id].push(target);
          inDegree[target]++;
        }
      });
    }
  });

  const isStandalone = (id: string) => {
    return inDegree[id] === 0 && (!connections[id] || connections[id] === '');
  };

  const queue: string[] = [];
  const seqOrders: Record<string, number> = {};
  
  machines.forEach(m => {
    if (inDegree[m.id] === 0 && !isStandalone(m.id)) {
      queue.push(m.id);
      seqOrders[m.id] = 1;
    }
  });

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currSeq = seqOrders[curr] || 1;
    adj[curr].forEach(next => {
      const nextSeq = Math.max(seqOrders[next] || 0, currSeq + 1);
      seqOrders[next] = nextSeq;
      inDegree[next]--;
      if (inDegree[next] === 0) {
        queue.push(next);
      }
    });
  }

  // Backwards alignment check for root nodes
  machines.forEach(m => {
    if (isStandalone(m.id)) return;
    const targetVal = connections[m.id];
    if (targetVal) {
      const targets = typeof targetVal === 'string' ? targetVal.split(',') : [];
      targets.forEach(target => {
        if (target && seqOrders[target]) {
          const inDeg = inDegree[m.id] || 0;
          if (inDeg === 0 && seqOrders[m.id] < seqOrders[target] - 1) {
            seqOrders[m.id] = seqOrders[target] - 1;
          }
        }
      });
    }
  });

  // Assign standalone machines to align with their adjacent active machines
  machines.forEach((m, idx) => {
    if (isStandalone(m.id)) {
      let nearestSeq = 1;
      // Search backwards first
      for (let i = idx - 1; i >= 0; i--) {
        const other = machines[i];
        if (!isStandalone(other.id) && seqOrders[other.id]) {
          nearestSeq = seqOrders[other.id];
          break;
        }
      }
      // If not found, search forwards
      if (nearestSeq === 1) {
        for (let i = idx + 1; i < machines.length; i++) {
          const other = machines[i];
          if (!isStandalone(other.id) && seqOrders[other.id]) {
            nearestSeq = seqOrders[other.id];
            break;
          }
        }
      }
      seqOrders[m.id] = nearestSeq;
    }
  });

  return seqOrders;
};

const buildDescriptionFromConnections = (conns: Record<string, string>, machines: any[]) => {
  const descData: Record<string, { prev: string | null; next: string | null }> = {};
  
  machines.forEach((m) => {
    descData[m.id] = { prev: null, next: null };
  });

  Object.entries(conns).forEach(([src, destStr]) => {
    if (!destStr) return;
    const dests = destStr.split(',');
    
    dests.forEach((dest) => {
      if (descData[src]) {
        const nexts = descData[src].next ? descData[src].next!.split(',') : [];
        if (!nexts.includes(dest)) {
          nexts.push(dest);
          descData[src].next = nexts.join(',');
        }
      }
      if (descData[dest]) {
        const prevs = descData[dest].prev ? descData[dest].prev!.split(',') : [];
        if (!prevs.includes(src)) {
          prevs.push(src);
          descData[dest].prev = prevs.join(',');
        }
      }
    });
  });
  
  return JSON.stringify(descData);
};

const nodeTypes = {
  machineNode: MachineNode,
};

export const DiagramEditor: React.FC<DiagramEditorProps> = ({
  lineId,
  readOnly = false,
  onClose,
  hideSidebar = false,
}) => {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const currentLang = i18n.language || 'vi';
  const locale = currentLang === 'zh-CN' || currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'vi-VN';
  const queryClient = useQueryClient();
  const { addToast } = useUiStore();
  const { canEdit, canCreate } = usePermissions();

  const canConfigure = !readOnly && canEdit;
  const canAddRemove = !readOnly && canCreate;

  // ReactFlow instance for fitView
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Queries
  const { data: lineMachines = [], isLoading: loadingLineMachines } = useQuery({
    queryKey: ['line-machines-diagram', lineId],
    queryFn: () => linesApi.getMachines(lineId),
    refetchInterval: 2000,
  });

  const { data: allMachines = [], isLoading: loadingAllMachines } = useQuery({
    queryKey: ['machines-all-selector'],
    queryFn: machinesApi.getAll,
    enabled: canAddRemove,
  });

  const { data: telemetryMap = {} } = useQuery({
    queryKey: ['simulation-all-telemetry'],
    queryFn: getSimulationAll,
    refetchInterval: 2000,
  });

  const { data: allAlarms = [] } = useQuery({
    queryKey: ['alarms-all-editor'],
    queryFn: () => alarmsApi.getAll(),
    refetchInterval: 3000,
  });

  // Lines query to get connection map stored in line description
  const { data: lines } = useQuery({
    queryKey: ['lines-all-diagram'],
    queryFn: linesApi.getAll,
  });
  const currentLine = lines?.find(l => l.id === lineId);

  // Group machines by sequence order (needed for layout generation)
  const sortedGroups = useMemo(() => {
    const map = new Map<number, typeof lineMachines>();
    lineMachines.forEach((m) => {
      const order = m.sequenceOrder ?? 1;
      if (!map.has(order)) map.set(order, []);
      map.get(order)!.push(m);
    });

    const sortedKeys = Array.from(map.keys()).sort((a, b) => a - b);
    return sortedKeys.map((key) => ({
      sequenceOrder: key,
      machines: map.get(key)!,
    }));
  }, [lineMachines]);

  // Calculate Overall Line status
  const lineOverallStatus = useMemo(() => {
    if (lineMachines.length === 0) return 'OFFLINE';
    let hasError = false;
    let hasRunning = false;
    let hasWarning = false;

    lineMachines.forEach((m) => {
      const telemetry = telemetryMap[m.id];
      const status = (telemetry?.status ?? m.status ?? 'offline').toLowerCase().trim();
      if (status === 'error') hasError = true;
      else if (status === 'running') hasRunning = true;
      else if (status === 'stopped' || status === 'warning') hasWarning = true;
    });

    if (hasError) return 'ERROR';
    if (hasWarning) return 'WARNING';
    if (hasRunning) return 'RUNNING';
    return 'IDLE';
  }, [lineMachines, telemetryMap]);

  const connections = useMemo(() => {
    if (!currentLine || !currentLine.description) {
      // Build default connections based on sequenceOrder
      const conns: Record<string, string> = {};
      const sorted = [...lineMachines].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        
        if (current.machineCode === 'CHASSIS-01' || (current.name.toLowerCase().includes('chassis') && !current.name.toLowerCase().includes('tổng hợp'))) {
          // Chassis is standalone
        } else if (current.machineCode === 'SMB-02' || current.name.includes('SMB 2')) {
          const assembly = sorted.find(m => m.machineCode === 'CHASSIS-SMB-01' || m.name.toLowerCase().includes('tổng hợp'));
          if (assembly) {
            conns[current.id] = assembly.id;
          } else {
            conns[current.id] = next.id;
          }
        } else if (current.machineCode === 'SCREW-01' || current.name.toLowerCase().includes('screw')) {
          const smb2 = sorted.find(m => m.machineCode === 'SMB-02' || m.name.includes('SMB 2'));
          if (smb2) {
            conns[current.id] = smb2.id;
          } else {
            conns[current.id] = next.id;
          }
        } else {
          conns[current.id] = next.id;
        }
      }
      return conns;
    }

    try {
      if (currentLine.description.trim().startsWith('{')) {
        const parsed = JSON.parse(currentLine.description);
        
        // 1. Check if it's the prev/next object format: { "machineId": { "prev": ..., "next": ... } }
        const keys = Object.keys(parsed);
        if (keys.length > 0 && parsed[keys[0]] && (parsed[keys[0]].hasOwnProperty('prev') || parsed[keys[0]].hasOwnProperty('next'))) {
          const conns: Record<string, string> = {};
          keys.forEach((srcId) => {
            const nextVal = parsed[srcId]?.next;
            if (nextVal) {
              conns[srcId] = nextVal;
            }
          });
          return conns;
        }

        // 2. Check if it's the old ReactFlow format
        if (parsed && parsed.edges && Array.isArray(parsed.edges)) {
          const conns: Record<string, string> = {};
          parsed.edges.forEach((e: any) => {
            if (conns[e.source]) {
              conns[e.source] = `${conns[e.source]},${e.target}`;
            } else {
              conns[e.source] = e.target;
            }
          });
          return conns;
        }

        return parsed;
      }
    } catch (e) {
      // Fallback
    }

    const conns: Record<string, string> = {};
    const sorted = [...lineMachines].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      if (current.machineCode === 'CHASSIS-01' || (current.name.toLowerCase().includes('chassis') && !current.name.toLowerCase().includes('tổng hợp'))) {
        // Chassis is standalone
      } else if (current.machineCode === 'SMB-02' || current.name.includes('SMB 2')) {
        const assembly = sorted.find(m => m.machineCode === 'CHASSIS-SMB-01' || m.name.toLowerCase().includes('tổng hợp'));
        if (assembly) {
          conns[current.id] = assembly.id;
        } else {
          conns[current.id] = next.id;
        }
      } else if (current.machineCode === 'SCREW-01' || current.name.toLowerCase().includes('screw')) {
        const smb2 = sorted.find(m => m.machineCode === 'SMB-02' || m.name.includes('SMB 2'));
        if (smb2) {
          conns[current.id] = smb2.id;
        } else {
          conns[current.id] = next.id;
        }
      } else {
        conns[current.id] = next.id;
      }
    }
    return conns;
  }, [currentLine, lineMachines]);

  const handleConnectionChange = (sourceId: string, targetId: string) => {
    const newConnections = { ...connections };
    if (targetId) {
      newConnections[sourceId] = targetId;
    } else {
      delete newConnections[sourceId];
    }

    const newSeqOrders = calculateSequenceOrders(newConnections, lineMachines);

    // Save connections to line description
    if (currentLine) {
      const descJson = buildDescriptionFromConnections(newConnections, lineMachines);
      linesApi.update(currentLine.id, {
        name: currentLine.name,
        description: descJson,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['lines-all-diagram'] });
      });
    }

    // Update sequence orders in DB
    const updatePromises = lineMachines.map((m) => {
      const newOrder = newSeqOrders[m.id] ?? m.sequenceOrder ?? 1;
      if (newOrder !== m.sequenceOrder) {
        return linesApi.updateMachineOrder(lineId, m.id, newOrder);
      }
      return Promise.resolve();
    });

    Promise.all(updatePromises)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['line-machines-diagram', lineId] });
        addToast('success', t('common.success', 'Cập nhật liên kết thành công'));
      })
      .catch((err) => {
        addToast('error', t('common.error', 'Lỗi cập nhật liên kết'));
      });
  };

  // Selected machine for the detail sidebar panel
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'config'>('stats');
  const [viewMode, setViewMode] = useState<'diagram' | 'config'>('diagram');
  
  const [localNodes, setLocalNodes, onNodesChange] = useNodesState<any>([]);
  const [localEdges, setLocalEdges, onEdgesChange] = useEdgesState<any>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  const onConnect = useCallback((params: any) => {
    setLocalEdges((eds) => addEdge({
      ...params,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#06b6d4', strokeWidth: 2.25 },
    }, eds));
  }, [setLocalEdges]);

  const onNodesDelete = useCallback((deletedNodes: any[]) => {
    const deletedIds = new Set(deletedNodes.map(n => n.id));
    setLocalEdges(eds => eds.filter(e => !deletedIds.has(e.source) && !deletedIds.has(e.target)));
  }, [setLocalEdges]);

  const onDragStart = (event: React.DragEvent, machineId: string) => {
    event.dataTransfer.setData('application/reactflow', machineId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const machineId = event.dataTransfer.getData('application/reactflow');
    if (!machineId) return;

    const reactFlowBounds = containerRef.current?.getBoundingClientRect();
    if (!reactFlowBounds || !reactFlowInstance) return;

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const machine = allMachines.find(m => m.id === machineId);
    if (!machine) return;

    const newNode = {
      id: machine.id,
      type: 'machineNode',
      position,
      data: {
        id: machine.id,
        name: machine.name,
        machineCode: machine.machineCode || '',
        status: machine.status || 'offline',
        ip: machine.ip,
        productionCount: 0,
        telemetry: machine.lastPlcData || {},
        plcConnected: machine.plcConnected,
      },
    };

    setLocalNodes((prev) => [...prev, newNode]);
  }, [reactFlowInstance, allMachines, setLocalNodes]);

  const handleSaveSortedOrder = async () => {
    const serializedLayout = JSON.stringify({
      nodes: localNodes.map((n: any) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          id: n.data.id,
          name: n.data.name,
          machineCode: n.data.machineCode,
          ip: n.data.ip,
        }
      })),
      edges: localEdges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    });

    const conns: Record<string, string> = {};
    localEdges.forEach((e: any) => {
      if (conns[e.source]) {
        conns[e.source] = `${conns[e.source]},${e.target}`;
      } else {
        conns[e.source] = e.target;
      }
    });

    const newSeqOrders = calculateSequenceOrders(conns, localNodes.map((n: any) => ({ id: n.id, sequenceOrder: 1 })));

    try {
      const added = localNodes.filter((n: any) => !lineMachines.some(m => m.id === n.id));
      const removed = lineMachines.filter(m => !localNodes.some((n: any) => n.id === m.id));
      const remaining = localNodes.filter((n: any) => lineMachines.some(m => m.id === n.id));

      for (const n of added) {
        await linesApi.addMachine(lineId, {
          machineId: n.id,
          sequenceOrder: newSeqOrders[n.id] ?? 1,
        });
      }

      for (const m of removed) {
        await linesApi.removeMachine(lineId, m.id);
      }

      for (const n of remaining) {
        const newOrder = newSeqOrders[n.id] ?? 1;
        const oldMachine = lineMachines.find(m => m.id === n.id);
        if (oldMachine && oldMachine.sequenceOrder !== newOrder) {
          await linesApi.updateMachineOrder(lineId, n.id, newOrder);
        }
      }

      if (currentLine) {
        const descJson = buildDescriptionFromConnections(conns, localNodes);
        await linesApi.update(currentLine.id, {
          name: currentLine.name,
          description: descJson,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['lines-all-diagram'] });
      queryClient.invalidateQueries({ queryKey: ['line-machines-diagram', lineId] });
      
      addToast('success', t('common.success', 'Đã lưu cấu hình sơ đồ dây chuyền thành công'));
      setViewMode('diagram');
    } catch (err) {
      addToast('error', t('common.error', 'Lỗi khi lưu cấu hình sơ đồ'));
    }
  };





  // Mutation: Remove machine from line
  const removeMachineMutation = useMutation({
    mutationFn: (machineId: string) =>
      linesApi.removeMachine(lineId, machineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['line-machines-diagram', lineId] });
      setSelectedMachine(null);
      addToast('success', t('flowDesigner.toast.machineRemoved', 'Đã xóa thiết bị khỏi dây chuyền'));
    },
    onError: (err: any) => {
      addToast('error', err.response?.data?.error || t('flowDesigner.toast.removeMachineFailed', 'Lỗi xóa thiết bị'));
    },
  });





  // Filter machines that can be added to the line
  const availableMachines = useMemo(() => {
    if (!allMachines || !localNodes) return [];
    const assignedIds = new Set(localNodes.map((n: any) => n.id));
    return allMachines.filter(m => !assignedIds.has(m.id));
  }, [allMachines, localNodes]);



  const handleNodeClick = (_event: React.MouseEvent, node: any) => {
    const machine = lineMachines.find((m) => m.id === node.id);
    if (machine) {
      setSelectedMachine(machine);
    }
  };

  // Filter alarms for the currently selected machine
  const activeMachineAlarms = useMemo(() => {
    if (!selectedMachine) return [];
    return allAlarms.filter((a) => a.machineId === selectedMachine.id);
  }, [selectedMachine, allAlarms]);

  // Live telemetry for the selected machine
  const activeMachineTelemetry = selectedMachine ? (telemetryMap[selectedMachine.id] as any) : null;

  useEffect(() => {
    if (reactFlowInstance && localNodes.length > 0 && dimensions.width > 0 && dimensions.height > 0) {
      const timer = setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, maxZoom: 1.0, duration: 250 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [reactFlowInstance, localNodes.length, dimensions.width, dimensions.height]);

  useEffect(() => {
    if (loadingLineMachines || !lineMachines) return;
    
    // Check if description has layout JSON
    let savedLayout: any = null;
    if (currentLine && currentLine.description) {
      try {
        if (currentLine.description.trim().startsWith('{')) {
          const parsed = JSON.parse(currentLine.description);
          if (parsed.nodes && parsed.edges) {
            savedLayout = parsed;
          }
        }
      } catch (e) {}
    }

    if (savedLayout && viewMode === 'config') {
      const mappedNodes = savedLayout.nodes.map((n: any) => {
        const m = lineMachines.find(item => item.id === n.id || item.id === n.data?.id);
        if (m) {
          const telemetry = telemetryMap[m.id];
          const activeStatus = telemetry?.status ?? m.status ?? 'offline';
          return {
            ...n,
            id: m.id,
            position: n.position || { x: 50, y: 150 },
            data: {
              id: m.id,
              name: m.name,
              machineCode: m.machineCode || '',
              status: activeStatus,
              ip: m.ip,
              productionCount: telemetry?.productionCount ?? m.lastPlcData?.productionCount ?? 0,
              telemetry: telemetry || m.lastPlcData,
              plcConnected: m.plcConnected,
            }
          };
        }
        return null;
      }).filter(Boolean);
      
      setLocalNodes(mappedNodes);
      setLocalEdges(savedLayout.edges || []);
    } else {
      const defaultNodes: any[] = [];
      const defaultEdges: any[] = [];

      // 1. Build adjacency maps
      const adj: Record<string, string[]> = {};
      const rev: Record<string, string[]> = {};
      const inDegree: Record<string, number> = {};

      lineMachines.forEach((m) => {
        adj[m.id] = [];
        rev[m.id] = [];
        inDegree[m.id] = 0;
      });

      Object.entries(connections).forEach(([src, targetId]) => {
        if (!targetId) return;
        const targets = typeof targetId === 'string' ? targetId.split(',') : [];
        targets.forEach((dest) => {
          if (lineMachines.some(m => m.id === src) && lineMachines.some(m => m.id === dest)) {
            if (adj[src] && !adj[src].includes(dest)) {
              adj[src].push(dest);
            }
            if (rev[dest] && !rev[dest].includes(src)) {
              rev[dest].push(src);
            }
          }
        });
      });

      // Calculate actual inDegree
      Object.keys(rev).forEach((nodeId) => {
        inDegree[nodeId] = rev[nodeId].length;
      });

      // 2. Find root nodes (inDegree === 0)
      const roots = lineMachines.filter((m) => inDegree[m.id] === 0);
      
      // Sort roots to make sure Screw is row 0, Jumper is row 1
      roots.sort((a, b) => {
        const aIsScrew = a.machineCode?.toLowerCase().includes('screw') || a.name?.toLowerCase().includes('screw');
        const bIsScrew = b.machineCode?.toLowerCase().includes('screw') || b.name?.toLowerCase().includes('screw');
        if (aIsScrew && !bIsScrew) return -1;
        if (!aIsScrew && bIsScrew) return 1;
        return (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0);
      });

      // 3. Calculate topological column indexes (depth) using BFS longest path
      const depth: Record<string, number> = {};
      lineMachines.forEach((m) => {
        depth[m.id] = 0;
      });

      const queue: string[] = roots.map(r => r.id);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const currDepth = depth[curr];
        (adj[curr] || []).forEach((next) => {
          depth[next] = Math.max(depth[next] || 0, currDepth + 1);
          queue.push(next);
        });
      }

      // 3b. Optimize columns using ALAP (As Late As Possible) shift to align nodes closer to their targets
      const colIndex: Record<string, number> = {};
      lineMachines.forEach((m) => {
        colIndex[m.id] = depth[m.id];
      });

      // Sort nodes by depth descending to calculate max shift backwards
      const descDepthNodes = [...lineMachines].sort((a, b) => depth[b.id] - depth[a.id]);
      descDepthNodes.forEach((m) => {
        const targets = adj[m.id] || [];
        if (targets.length > 0) {
          const minTargetCol = Math.min(...targets.map(tId => colIndex[tId]));
          colIndex[m.id] = minTargetCol - 1;
        }
      });

      // 4. Calculate dynamic row values topologically
      const rowVal: Record<string, number> = {};
      
      // Assign roots their distinct row indexes
      roots.forEach((r, idx) => {
        rowVal[r.id] = idx;
      });

      // Sort all nodes topologically by depth to propagate row values correctly
      const topoNodes = [...lineMachines].sort((a, b) => depth[a.id] - depth[b.id]);
      
      topoNodes.forEach((m) => {
        if (rowVal[m.id] !== undefined) return; // already set (root)
        
        const preds = rev[m.id] || [];
        if (preds.length > 0) {
          const sum = preds.reduce((acc, pId) => acc + (rowVal[pId] ?? 0), 0);
          rowVal[m.id] = sum / preds.length;
        } else {
          rowVal[m.id] = 0;
        }
      });

      // Max row value (or max index among roots)
      const maxRootIdx = Math.max(1, roots.length - 1);

      // Build coordinates
      lineMachines.forEach((m) => {
        const col = colIndex[m.id] ?? 0;
        const row = rowVal[m.id] ?? 0;
        
        const x = 50 + col * 350;
        // Center rowVal around middle
        let y = 150;
        if (roots.length > 1) {
          y = 150 + (row - (maxRootIdx / 2)) * 220;
        } else {
          // If only 1 root path, stack them vertically if multiple nodes have same depth
          const sameDepthNodes = lineMachines.filter(o => colIndex[o.id] === col);
          const sameDepthIdx = sameDepthNodes.indexOf(m);
          const N = sameDepthNodes.length;
          y = 150 - ((N - 1) * 110) + (sameDepthIdx * 220);
        }

        const telemetry = telemetryMap[m.id];
        const activeStatus = telemetry?.status ?? m.status ?? 'offline';

        defaultNodes.push({
          id: m.id,
          type: 'machineNode',
          position: { x, y },
          data: {
            id: m.id,
            name: m.name,
            machineCode: m.machineCode || '',
            status: activeStatus,
            ip: m.ip,
            productionCount: telemetry?.productionCount ?? m.lastPlcData?.productionCount ?? 0,
            telemetry: telemetry || m.lastPlcData,
            plcConnected: m.plcConnected,
          },
        });
      });

      Object.entries(connections).forEach(([sourceId, targetId]) => {
        if (!targetId) return;
        const targets = typeof targetId === 'string' ? targetId.split(',') : [];
        targets.forEach((tId) => {
          if (!tId) return;
          if (lineMachines.some(m => m.id === sourceId) && lineMachines.some(m => m.id === tId)) {
            defaultEdges.push({
              id: `edge-${sourceId}-${tId}`,
              source: sourceId,
              target: tId,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#06b6d4', strokeWidth: 2.25 },
            });
          }
        });
      });

      setLocalNodes(defaultNodes);
      setLocalEdges(defaultEdges);
    }
    
    setIsInitialized(true);
  }, [lineMachines, currentLine, loadingLineMachines, viewMode]);

  useEffect(() => {
    if (!isInitialized || localNodes.length === 0) return;
    setLocalNodes((nodes: any[]) => nodes.map(n => {
      const m = lineMachines.find(item => item.id === n.id);
      if (m) {
        const telemetry = telemetryMap[m.id];
        const activeStatus = telemetry?.status ?? m.status ?? 'offline';
        const newProdCount = telemetry?.productionCount ?? m.lastPlcData?.productionCount ?? 0;
        
        if (
          n.data.status !== activeStatus || 
          n.data.productionCount !== newProdCount || 
          n.data.telemetry !== (telemetry || m.lastPlcData)
        ) {
          return {
            ...n,
            data: {
              ...n.data,
              status: activeStatus,
              productionCount: newProdCount,
              telemetry: telemetry || m.lastPlcData,
            }
          };
        }
      }
      return n;
    }));
  }, [telemetryMap, lineMachines, isInitialized, setLocalNodes]);

  return (
    <div className="flex flex-col h-full bg-[#0B0F1A] text-[#EEEEEE] overflow-hidden select-none">
      
      {/* Redesigned Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-[#101625] border-b border-[#243044]">
        <div className="flex items-center gap-4">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-[#121A2B] hover:bg-[#243044] border border-[#243044] text-[#EEEEEE] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            >
              <ChevronLeft className="w-4 h-4 text-[#00ADB5]" />
              Quay lại
            </button>
          )}
          <div className="text-left">
            <div className="flex items-center gap-3">
              <h2 className="text-base md:text-lg font-bold text-[#EEEEEE] uppercase tracking-wide">
                {currentLine ? tDynamic(currentLine.name) : 'Dây chuyền'}
              </h2>
              <span
                className="px-2.5 py-0.5 rounded text-[10px] font-black tracking-wider uppercase border"
                style={{
                  color: lineOverallStatus === 'RUNNING' ? '#00E676' : lineOverallStatus === 'ERROR' ? '#EF4444' : lineOverallStatus === 'WARNING' ? '#F59E0B' : '#38BDF8',
                  backgroundColor: lineOverallStatus === 'RUNNING' ? 'rgba(0,230,118,0.1)' : lineOverallStatus === 'ERROR' ? 'rgba(239,68,68,0.1)' : lineOverallStatus === 'WARNING' ? 'rgba(245,158,11,0.1)' : 'rgba(56,189,248,0.1)',
                  borderColor: lineOverallStatus === 'RUNNING' ? 'rgba(0,230,118,0.25)' : lineOverallStatus === 'ERROR' ? 'rgba(239,68,68,0.25)' : lineOverallStatus === 'WARNING' ? 'rgba(245,158,11,0.25)' : 'rgba(56,189,248,0.25)',
                }}
              >
                {lineOverallStatus}
              </span>
            </div>
            <p className="text-xs text-[#9CA3AF] mt-0.5">Giám sát tiến trình sản xuất và liên kết PLC tự động.</p>
          </div>
        </div>

        {/* View Mode Toggle / Action Buttons */}
        <div className="flex items-center gap-2">
          {viewMode === 'config' ? (
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleSaveSortedOrder}
                className="px-4 py-1.5 bg-[#00ADB5] hover:bg-[#00ADB5]/80 text-[#0B0F1A] font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Lưu sơ đồ
              </button>
              <button
                onClick={() => setViewMode('diagram')}
                className="px-4 py-1.5 bg-[#121A2B] hover:bg-[#243044] border border-[#243044] text-[#EEEEEE] font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
            </div>
          ) : (
            <div className="flex bg-[#121A2B] border border-[#243044] p-1 rounded-lg">
              <button
                onClick={() => setViewMode('diagram')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'diagram'
                    ? 'bg-[#00ADB5] text-[#0B0F1A]'
                    : 'text-[#9CA3AF] hover:text-[#EEEEEE]'
                }`}
              >
                Sơ đồ luồng
              </button>
              {canConfigure && (
                <button
                  onClick={() => {
                    setViewMode('config');
                  }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    (viewMode as string) === 'config'
                      ? 'bg-[#00ADB5] text-[#0B0F1A]'
                      : 'text-[#9CA3AF] hover:text-[#EEEEEE]'
                  }`}
                >
                  Thiết kế luồng
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar for Dragging Machines (only in config mode) */}
        {viewMode === 'config' && (
          <div className="w-[260px] bg-[#101625] border-r border-[#243044] p-4 flex flex-col gap-4 overflow-y-auto flex-shrink-0 text-left">
            <div>
              <h3 className="text-xs font-bold text-[#EEEEEE] uppercase tracking-wider">
                Thiết bị chưa dùng
              </h3>
              <p className="text-[10px] text-[#9CA3AF] mt-1 leading-normal">
                Kéo các trạm máy bên dưới thả vào sơ đồ để gán vào dây chuyền:
              </p>
            </div>
            
            <div className="space-y-3">
              {availableMachines.length > 0 ? (
                availableMachines.map((m) => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, m.id)}
                    className="p-3 bg-[#121A2B] border border-[#243044] hover:border-[#00ADB5] rounded-lg cursor-grab active:cursor-grabbing text-xs transition-colors flex items-center justify-between group select-none text-left"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <h4 className="font-bold text-[#EEEEEE] truncate uppercase">
                        {tDynamic(m.name)}
                      </h4>
                      <span className="font-mono text-[9px] text-[#9CA3AF]">{m.machineCode || m.clientId || 'N/A'}</span>
                    </div>
                    <Plus className="w-3.5 h-3.5 text-[#00ADB5] shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-[10px] text-[#9CA3AF] border border-dashed border-[#243044] rounded-lg">
                  Tất cả trạm máy đã được gán
                </div>
              )}
            </div>
          </div>
        )}

        {/* Center: ReactFlow Canvas */}
        <div 
          ref={containerRef} 
          className="flex-1 flex flex-col relative overflow-hidden bg-[#0B0F1A]"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {loadingLineMachines ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 bg-[#0B0F1A]">
              <div className="w-8 h-8 border-4 border-[#243044] border-t-[#00ADB5] rounded-full animate-spin"></div>
              <p className="text-[11px] text-[#9CA3AF] font-bold uppercase tracking-wider">Đang khởi tạo sơ đồ...</p>
            </div>
          ) : localNodes.length > 0 ? (
            <ReactFlow
              nodes={localNodes}
              edges={localEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodesDelete={onNodesDelete}
              nodeTypes={nodeTypes}
              onNodeClick={handleNodeClick}
              onInit={(instance) => setReactFlowInstance(instance)}
              nodesDraggable={viewMode === 'config'}
              nodesConnectable={viewMode === 'config'}
              edgesFocusable={viewMode === 'config'}
              edgesReconnectable={viewMode === 'config'}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1.0 }}
              minZoom={0.5}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              className="bg-[#0B0F1A]"
            >
              <Background color="#243044" gap={16} size={1} />
              <Controls className="!bg-[#121A2B] !border-[#243044] !text-[#EEEEEE]" />
              {viewMode === 'config' && (
                <Panel position="top-left" className="bg-[#121A2B] border border-[#243044] p-2.5 rounded-lg text-[10px] text-[#9CA3AF] max-w-[220px] shadow-lg leading-relaxed text-left select-none pointer-events-none">
                  💡 <span className="font-bold text-[#EEEEEE]">Mẹo thiết kế:</span> Drag-drop thiết bị từ panel trái vào sơ đồ. Kéo thả từ chốt này sang chốt kia để nối dây. Chọn node/cạnh rồi nhấn phím <kbd className="bg-[#0B0F1A] px-1 py-0.5 rounded border border-[#243044] font-mono text-[9px] text-[#EEEEEE]">Delete</kbd> hoặc <kbd className="bg-[#0B0F1A] px-1 py-0.5 rounded border border-[#243044] font-mono text-[9px] text-[#EEEEEE]">Backspace</kbd> để xóa.
                </Panel>
              )}
              <style>{`
                .react-flow__controls {
                  background-color: #121A2B !important;
                  border: 1px solid #243044 !important;
                  border-radius: 6px !important;
                  overflow: hidden !important;
                  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
                }
                .react-flow__controls-button {
                  background: #121A2B !important;
                  border: none !important;
                  border-bottom: 1px solid #243044 !important;
                  color: #EEEEEE !important;
                  fill: #EEEEEE !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                }
                .react-flow__controls-button:last-child {
                  border-bottom: none !important;
                }
                .react-flow__controls-button:hover {
                  background: #243044 !important;
                }
                .react-flow__controls-button svg {
                  fill: #EEEEEE !important;
                }
                .react-flow__edge-path {
                  stroke-dasharray: 6,4 !important;
                }
                .react-flow__edge-path.animated {
                  stroke-dasharray: 6,4 !important;
                  animation: react-flow__dashanim 1s linear infinite !important;
                }
                @keyframes react-flow__dashanim {
                  from {
                    stroke-dashoffset: 20;
                  }
                  to {
                    stroke-dashoffset: 0;
                  }
                }
              `}</style>
            </ReactFlow>
          ) : (
            <div className="flex flex-col items-center justify-center h-full border border-dashed border-[#243044] rounded-xl bg-[#101625]/20 p-6 text-center m-6">
              <Server className="w-10 h-10 text-[#9CA3AF] mb-2" />
              <h4 className="text-xs font-bold text-[#EEEEEE] uppercase tracking-wider">{t('flowDesigner.empty.title', 'Dây chuyền trống')}</h4>
              <p className="text-[11px] text-[#9CA3AF] mt-1">Chưa gán máy trạm nào vào luồng. Sử dụng nút Thiết kế luồng ở góc trên để kéo thả thiết bị.</p>
            </div>
          )}
        </div>

          {/* Right Container: Sidebar (Machine Detail only) */}
          {!hideSidebar && selectedMachine && (
            <div className="w-[320px] bg-[#101625] border-l border-[#243044] p-5 flex flex-col gap-4 overflow-y-auto flex-shrink-0 text-left animate-in slide-in-from-right duration-250">
              <div className="flex items-center justify-between border-b border-[#243044] pb-3 flex-shrink-0">
                <div className="min-w-0 flex-1 pr-2">
                  <h3 className="text-sm font-bold text-[#EEEEEE] uppercase tracking-wider truncate">
                    {tDynamic(selectedMachine.name)}
                  </h3>
                  <p className="font-mono text-[10px] text-[#9CA3AF] mt-0.5">{selectedMachine.machineCode || 'N/A'}</p>
                </div>
                <button
                  onClick={() => setSelectedMachine(null)}
                  className="text-[#9CA3AF] hover:text-[#EEEEEE] p-1 rounded hover:bg-[#121A2B] transition-colors cursor-pointer"
                  title="Đóng"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* General Parameters */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-[#00ADB5] uppercase tracking-widest">Thông tin kết nối PLC</h4>
                <div className="bg-[#121A2B] rounded-lg p-3 border border-[#243044] space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#9CA3AF]">IP Địa chỉ:</span>
                    <span className="font-mono font-bold text-[#EEEEEE]">{selectedMachine.ip || '0.0.0.0'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#9CA3AF]">PLC Connected:</span>
                    <span className="flex items-center gap-1 font-bold">
                      <Wifi className="w-3.5 h-3.5 text-[#00E676]" />
                      <span className="text-[#00E676]">ONLINE</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#9CA3AF]">Cập nhật cuối:</span>
                    <span className="font-mono text-[#EEEEEE] text-[10px]">
                      {activeMachineTelemetry?.timestamp ? new Date(activeMachineTelemetry.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#9CA3AF]">Uptime tích lũy:</span>
                    <span className="font-mono text-[#EEEEEE]">
                      {(() => {
                        const sec = activeMachineTelemetry?.uptimeSeconds ?? selectedMachine.uptimeSeconds ?? 0;
                        const hrs = Math.floor(sec / 3600);
                        const mins = Math.floor((sec % 3600) / 60);
                        return `${hrs} giờ ${mins} phút`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Connection Links Configuration */}
              {canConfigure && (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-[#00ADB5] uppercase tracking-widest">Cấu hình liên kết luồng</h4>
                  <div className="bg-[#121A2B] rounded-lg p-3 border border-[#243044] space-y-2.5 text-xs">
                    <p className="text-[10px] text-[#9CA3AF] mb-1.5 leading-relaxed">
                      Chọn các trạm máy tiếp theo trong quy trình sản xuất (hệ thống sẽ tự động tính toán thứ tự hiển thị song song):
                    </p>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                      {lineMachines
                        .filter((other) => other.id !== selectedMachine.id)
                        .map((other) => {
                          const targetVal = connections[selectedMachine.id] || '';
                          const targets = typeof targetVal === 'string' ? targetVal.split(',') : [];
                          const isConnected = targets.includes(other.id);

                          return (
                            <label key={other.id} className="flex items-center gap-2 text-[#EEEEEE] cursor-pointer hover:text-[#00ADB5] transition-colors py-0.5 select-none">
                              <input
                                type="checkbox"
                                checked={isConnected}
                                onChange={(e) => {
                                  let newTargets = [...targets];
                                  if (e.target.checked) {
                                    if (!newTargets.includes(other.id)) {
                                      newTargets.push(other.id);
                                    }
                                  } else {
                                    newTargets = newTargets.filter(id => id !== other.id);
                                  }
                                  const newConnStr = newTargets.filter(Boolean).join(',');
                                  handleConnectionChange(selectedMachine.id, newConnStr);
                                }}
                                className="accent-[#00ADB5] rounded border-[#243044] bg-[#0B0F1A]"
                              />
                              <span>{tDynamic(other.name)}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}

              {/* Production Parameters */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-[#00ADB5] uppercase tracking-widest">{t('machines.accumulatedData', 'Dữ liệu Sản xuất tích lũy')}</h4>
                <div className="bg-[#121A2B] rounded-lg p-3 border border-[#243044] space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#9CA3AF]">{t('machines.productionCount', 'Sản lượng đạt')}:</span>
                    <span className="font-mono font-bold text-sm text-[#00E676]">
                      {(activeMachineTelemetry?.productionCount ?? selectedMachine.lastPlcData?.productionCount ?? 0).toLocaleString(locale)} pcs
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#9CA3AF]">{t('machines.temperature', 'Nhiệt độ trạm')}:</span>
                    <span className="font-mono text-[#EEEEEE]">
                      {activeMachineTelemetry?.temperature ?? (selectedMachine.lastPlcData as any)?.temperature ?? 0} °C
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#9CA3AF]">Tốc độ sản xuất:</span>
                    <span className="font-mono text-[#EEEEEE]">
                      {activeMachineTelemetry?.uph ?? (selectedMachine.lastPlcData as any)?.uph ?? 0} pcs/h
                    </span>
                  </div>
                </div>
              </div>

              {/* Alarm/Errors History logs */}
              <div className="space-y-3 flex-1 flex flex-col min-h-0 overflow-hidden">
                <h4 className="text-[10px] font-black text-[#EF4444] uppercase tracking-widest flex-shrink-0">Nhật ký lỗi gần đây</h4>
                <div className="border border-[#243044] rounded-lg overflow-hidden bg-[#121A2B]/40 flex-1 flex flex-col min-h-0">
                  <div className="overflow-y-auto flex-1 divide-y divide-[#243044]/30">
                    {activeMachineAlarms.length > 0 ? (
                      activeMachineAlarms.map((a) => (
                        <div key={a.id} className="p-2.5 text-left text-[11px] hover:bg-[#243044]/25">
                          <div className="flex justify-between mb-1">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border tracking-wider"
                              style={{
                                color: a.severity === 'CRITICAL' ? '#EF4444' : '#F59E0B',
                                backgroundColor: a.severity === 'CRITICAL' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                borderColor: a.severity === 'CRITICAL' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'
                              }}
                            >
                              {a.severity}
                            </span>
                            <span className="font-mono text-[#9CA3AF] text-[9px]">
                              {new Date(a.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-[#EEEEEE] leading-snug">{a.message}</p>
                          <p className="text-[#9CA3AF] text-[10px] mt-1 font-bold">
                            Trạng thái: <span className={a.status === 'ACTIVE' ? 'text-[#EF4444]' : 'text-[#00E676]'}>{a.status}</span>
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-[#9CA3AF] text-xs">
                        Không phát hiện cảnh báo lỗi gần đây.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
};
export default DiagramEditor;
