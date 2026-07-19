"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, ArrowRight, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const titles: Record<string, [string, string]> = {
  dashboard: ['OPERATIONS OVERVIEW', '业务总览'],
  users: ['CUSTOMER ACCESS', '用户与会员'],
  jobs: ['TRANSLATION PIPELINE', '翻译任务'],
  subtitles: ['CONTENT QUALITY', '字幕结果'],
  videos: ['SOURCE LIBRARY', '视频库']
};

const adminPaths: Record<string, string> = {
  dashboard: "/",
  users: "/users",
  jobs: "/jobs",
  subtitles: "/subtitles",
  videos: "/videos"
};

type AdminPage = keyof typeof titles;

const formatDate = (v: any) => v ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(v)) : '—';
const short = (v: any) => v ? `${String(v).slice(0, 8)}…` : '—';

export function AdminConsole({ initialPage = "dashboard" }: { initialPage?: AdminPage }) {
  const [token, setToken] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  const page = initialPage;
  const [pageNo, setPageNo] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [filterInput, setFilterInput] = useState('all');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [now, setNow] = useState('');

  // Modals state
  const [memberModal, setMemberModal] = useState<{isOpen: boolean, id: string, plan: string, status: string, validUntil: string, videoLimit: string}>({isOpen: false, id: '', plan: '', status: '', validUntil: '', videoLimit: ''});
  const [subtitleModal, setSubtitleModal] = useState<{isOpen: boolean, id: string, status: string, score: number | null}>({isOpen: false, id: '', status: '', score: null});

  // Login Form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    setIsClient(true);
    const savedToken = localStorage.getItem('adminToken');
    if (savedToken) setToken(savedToken);
    
    setNow(new Date().toLocaleString('zh-CN', { hour12: false }));
    const t = setInterval(() => setNow(new Date().toLocaleString('zh-CN', { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem('adminToken');
  }, []);

  const fetchApi = useCallback(async (path: string, options: RequestInit = {}) => {
    const res = await fetch('/api/admin' + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') {
      logout();
      throw new Error('登录已失效');
    }
    if (!res.ok) throw new Error(result.error || '请求失败');
    return result;
  }, [token, logout]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (page === 'dashboard') {
        const d = await fetchApi('/dashboard');
        setData(d);
      } else {
        const q = new URLSearchParams({ page: pageNo.toString(), limit: '20', search });
        if (page === 'users' && filter) q.set('plan', filter);
        if (page === 'jobs' && filter) q.set('status', filter);
        if (page === 'subtitles' && filter) q.set('publication', filter);
        const d = await fetchApi(`/${page}?${q}`);
        setData(d);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, pageNo, search, filter, fetchApi]);

  useEffect(() => {
    if (token && isClient) loadData();
  }, [loadData, token, isClient]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetchApi('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setToken(res.token);
      localStorage.setItem('adminToken', res.token);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const applyFilters = () => {
    setSearch(searchInput.trim());
    setFilter(filterInput === "all" ? "" : filterInput);
    setPageNo(1);
  };

  const turnPage = (n: number) => {
    setPageNo(p => p + n);
  };

  // Actions
  const retryJob = async (id: string) => {
    if (!confirm('确认将这个失败任务重新加入翻译队列？')) return;
    try {
      await fetchApi(`/jobs/${id}/retry`, { method: 'POST' });
      toast.success('任务已重新入队');
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const downloadVtt = async (path: string) => {
    try {
      const r = await fetch('/api/admin' + path, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) { logout(); throw new Error('登录已失效'); }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || '下载失败');
      }
      const blob = await r.blob();
      const disposition = r.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = match?.[1] || 'subtitle.vtt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const saveMember = async () => {
    try {
      const { id, plan, status, validUntil, videoLimit } = memberModal;
      await fetchApi(`/users/${id}/membership`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan,
          status,
          validUntil: validUntil ? new Date(validUntil + 'T23:59:59Z').toISOString() : null,
          videoLimit: videoLimit === '' ? null : Number(videoLimit)
        })
      });
      setMemberModal({ ...memberModal, isOpen: false });
      toast.success('会员状态已更新');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const saveSubtitle = async () => {
    try {
      const { id, status, score } = subtitleModal;
      await fetchApi(`/subtitles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          publicationStatus: status,
          qualityScore: score === null || score === '' as any ? null : Number(score)
        })
      });
      setSubtitleModal({ ...subtitleModal, isOpen: false });
      toast.success('字幕审核结果已保存');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!isClient) return null;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Toaster />
        <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center p-6">
          <Card className="shadow-lg border-muted/50">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary text-primary-foreground font-bold text-xl rounded-xl flex items-center justify-center shadow">CC</div>
                <div className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">Caption Control</div>
              </div>
              <div>
                <CardTitle className="text-2xl font-bold mb-1">字幕业务控制台</CardTitle>
                <CardDescription>用户、翻译任务与公共字幕的统一运营入口。</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">管理员邮箱</label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">密码</label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
                </div>
                {loginError && <p className="text-sm text-destructive">{loginError}</p>}
                <Button type="submit" className="w-full">进入控制台 <ArrowRight className="ml-2 h-4 w-4"/></Button>
              </form>
            </CardContent>
          </Card>
          <div className="hidden md:flex flex-col justify-center space-y-6">
            <div className="space-y-2">
              <p className="font-bold tracking-widest text-primary uppercase text-sm">Live Operations</p>
              <h2 className="text-4xl font-extrabold tracking-tight leading-tight">看清每一次翻译，<br/>处理真正需要处理的事。</h2>
            </div>
            <p className="text-muted-foreground">后台仅供授权人员访问 · 登录状态保留 12 小时</p>
          </div>
        </div>
      </div>
    );
  }

  const renderToolbar = (placeholder: string, options: [string, string][] | null) => (
    <div className="flex items-center gap-3 mb-6">
      <Input placeholder={placeholder} value={searchInput} onChange={e => setSearchInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilters()} className="max-w-sm" />
      {options && (
        <Select value={filterInput} onValueChange={value => setFilterInput(value ?? "all")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => (
               <SelectItem key={o[0] || 'all'} value={o[0] || "all"}>{o[1]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button onClick={applyFilters}>查询</Button>
    </div>
  );

  const Pagination = () => data ? (
    <div className="flex items-center justify-between py-4">
      <span className="text-sm text-muted-foreground font-medium">共 {data.total} 条 · 第 {data.page} 页</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => turnPage(-1)} disabled={data.page <= 1}>上一页</Button>
        <Button variant="outline" size="sm" onClick={() => turnPage(1)} disabled={data.page * (data.limit||20) >= data.total}>下一页</Button>
      </div>
    </div>
  ) : null;

  const renderContent = () => {
    if (!data) return null;

    if (page === 'dashboard') {
      const m = data.metrics;
      const cards = [
        ['用户总数', m.userCount, '累计注册账户', ''],
        ['有效会员', m.memberCount, '当前可使用会员权益', 'good'],
        ['今日任务', m.jobsToday, `${m.activeJobs} 个任务处理中`, ''],
        ['24h 失败', m.failedJobs24h, '需要关注和重试', 'alert'],
        ['字幕结果', m.subtitleCount, '已持久化结果', ''],
        ['视频总量', m.videoCount, '已解析视频', ''],
        ['7日成功率', `${m.successRate7d}%`, '翻译完成 / 总任务', 'good']
      ];
      const maxTotal = Math.max(...(data.trend?.map((x: any) => x.total) || [0]), 1);

      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cards.map((c, i) => (
              <Card key={i} className={`shadow-sm ${c[3] === 'alert' ? 'border-destructive/30 bg-destructive/5' : c[3] === 'good' ? 'border-primary/30 bg-primary/5' : ''}`}>
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground mb-1">{c[0]}</p>
                  <p className="text-3xl font-bold tracking-tight">{c[1]}</p>
                  <p className="text-xs text-muted-foreground mt-2">{c[2]}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>近 7 日翻译趋势</CardTitle>
              <CardDescription>灰色：总任务 · 绿色：完成</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-end gap-2 mt-4 border-b border-border/50">
                {data.trend?.map((x: any, i: number) => {
                  const hTotal = Math.max(2, (x.total / maxTotal) * 100);
                  const hDone = Math.max(2, (x.completed / maxTotal) * 100);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-2 relative group">
                      <div className="w-full flex justify-center items-end h-[calc(100%-24px)] relative">
                        <div className="w-full max-w-12 bg-muted rounded-t-sm absolute bottom-0 transition-all group-hover:bg-muted-foreground/30" style={{ height: `${hTotal}%` }}></div>
                        <div className="w-full max-w-12 bg-primary/80 rounded-t-sm absolute bottom-0 z-10 transition-all group-hover:bg-primary" style={{ height: `${hDone}%` }}></div>
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate w-full text-center h-6">{x.label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (page === 'users') {
      return (
        <div>
          {renderToolbar("搜索邮箱、用户 ID 或匿名标识", [['all', '全部会员'], ['free', '免费用户'], ['standard', '标准会员'], ['contributor', '贡献者']])}
          <div className="border rounded-md bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>用户</TableHead><TableHead>最近登录 / IP</TableHead><TableHead>会员状态</TableHead><TableHead>AI 配置</TableHead><TableHead>使用量</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.items?.length ? data.items.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{u.identity || '匿名用户'}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{short(u.id)} · 注册 {formatDate(u.createdAt)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{formatDate(u.lastLoginAt)}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{u.lastLoginIp || '尚未记录'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.plan === 'standard' ? 'default' : u.plan === 'contributor' ? 'outline' : 'secondary'}>{u.plan}</Badge>
                      <div className="text-[11px] text-muted-foreground mt-1">{u.validUntil ? '至 ' + formatDate(u.validUntil) : (u.plan === 'free' ? '无期限' : '长期有效')} · {u.memberStatus}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.hasAiConfig ? '已配置' : '未配置'}</TableCell>
                    <TableCell>
                      <div className="text-sm">{u.videoUsage} 个视频</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{u.jobCount} 个任务 · {u.videoLimit === null ? '不限量' : `上限 ${u.videoLimit}`}</div>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => {
                        const end = u.validUntil ? new Date(u.validUntil).toISOString().slice(0, 10) : '';
                        setMemberModal({ isOpen: true, id: u.id, plan: u.plan, status: u.memberStatus, validUntil: end, videoLimit: u.videoLimit === null ? '' : String(u.videoLimit) });
                      }}>设置权限</Button>
                    </TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">没有符合条件的数据</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <Pagination />
        </div>
      );
    }

    if (page === 'jobs') {
      return (
        <div>
          {renderToolbar("搜索任务 ID、视频 ID、标题或用户邮箱", [['all', '全部状态'], ['queued', '排队中'], ['translating', '翻译中'], ['completed', '已完成'], ['failed', '失败']])}
          <div className="border rounded-md bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>任务 / 视频</TableHead><TableHead>状态</TableHead><TableHead>语言</TableHead><TableHead>模型</TableHead><TableHead>用户</TableHead><TableHead>创建时间</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.items?.length ? data.items.map((j: any) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      <div className="font-medium text-sm max-w-[200px] truncate" title={j.title}>{j.title || j.videoId}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{short(j.id)} · {j.videoId}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={j.status === 'failed' ? 'destructive' : j.status === 'completed' ? 'default' : 'secondary'}>{j.status}</Badge>
                      <div className="text-[11px] text-muted-foreground mt-1">{j.progress}%{j.error ? ' · ' + String(j.error).slice(0, 36) : ''}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{j.sourceLang} <ArrowRight className="inline h-3 w-3 mx-0.5 text-muted-foreground"/> {j.targetLang}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{j.styleId}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{j.provider || '—'}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{j.model || '—'}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{String(j.userIdentity).slice(0, 22)}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(j.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => downloadVtt(`/jobs/${j.id}/download`)}>下载字幕</Button>
                        {j.status === 'failed' && (
                          <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => retryJob(j.id)}>重新入队</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">没有符合条件的数据</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <Pagination />
        </div>
      );
    }

    if (page === 'subtitles') {
      return (
        <div>
          {renderToolbar("搜索字幕 ID、视频 ID、标题或用户邮箱", [['all', '全部发布状态'], ['private', '私有'], ['candidate', '候选'], ['recommended', '推荐'], ['archived', '归档'], ['rejected', '拒绝']])}
          <div className="border rounded-md bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>字幕 / 视频</TableHead><TableHead>语言</TableHead><TableHead>生成信息</TableHead><TableHead>发布状态</TableHead><TableHead>质量</TableHead><TableHead>规模</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.items?.length ? data.items.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium text-sm max-w-[200px] truncate" title={s.title}>{s.title || s.videoId}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{short(s.id)} · {s.videoId}</div>
                    </TableCell>
                    <TableCell className="text-sm">{s.sourceLang} <ArrowRight className="inline h-3 w-3 mx-0.5 text-muted-foreground"/> {s.targetLang}</TableCell>
                    <TableCell>
                      <div className="text-sm">{s.provider} / {s.model}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.styleId} · {formatDate(s.createdAt)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.publicationStatus === 'recommended' ? 'default' : s.publicationStatus === 'rejected' ? 'destructive' : 'secondary'}>{s.publicationStatus}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{s.qualityScore ?? '—'}</TableCell>
                    <TableCell>
                      <div className="text-sm">{s.cueCount} 条</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.characterCount} 字符</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => downloadVtt(`/subtitles/${s.id}/download`)}>下载</Button>
                        <Button variant="outline" size="sm" onClick={() => setSubtitleModal({ isOpen: true, id: s.id, status: s.publicationStatus, score: s.qualityScore ?? null })}>审核</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">没有符合条件的数据</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <Pagination />
        </div>
      );
    }

    if (page === 'videos') {
      return (
        <div>
          {renderToolbar("搜索视频 ID、标题或频道", null)}
          <div className="border rounded-md bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>视频</TableHead><TableHead>频道</TableHead><TableHead>字幕源</TableHead><TableHead>翻译任务</TableHead><TableHead>最近翻译</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.items?.length ? data.items.map((v: any) => (
                  <TableRow key={v.videoId}>
                    <TableCell>
                      <div className="font-medium text-sm max-w-[250px] truncate" title={v.title}>{v.title || '无标题'}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{v.videoId}</div>
                    </TableCell>
                    <TableCell className="text-sm">{v.channel || '—'}</TableCell>
                    <TableCell className="text-sm">{v.captionCount}</TableCell>
                    <TableCell className="text-sm">{v.jobCount}</TableCell>
                    <TableCell className="text-sm">{formatDate(v.lastTranslatedAt)}</TableCell>
                    <TableCell>
                      <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors hover:text-primary h-9 px-3 gap-1.5 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 rounded-md">
                        打开视频 <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">没有符合条件的数据</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <Pagination />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Toaster position="top-center" />
      <aside className="w-64 border-r bg-muted/20 flex flex-col shrink-0">
        <div className="p-6 font-bold flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center shadow-sm">CC</div>
          <div className="leading-tight text-sm tracking-wide">Caption<br />Control</div>
        </div>
        <nav className="flex-1 px-4 space-y-1.5 overflow-auto">
          {Object.entries(titles).map(([k, [, title]]) => (
            <Link key={k} href={adminPaths[k]} className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${page === k ? 'bg-accent text-accent-foreground font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              {title}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t flex flex-col gap-3">
          <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-2 px-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> 服务数据实时读取
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10">退出登录</Button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        <header className="h-16 border-b px-8 flex items-center justify-between shrink-0 bg-background/95 backdrop-blur z-10">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase mb-0.5">{titles[page][0]}</p>
            <h1 className="text-xl font-bold tracking-tight">{titles[page][1]}</h1>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-xs font-semibold font-mono text-muted-foreground bg-muted px-3 py-1.5 rounded-full">{now}</span>
            <Button variant="outline" size="icon" onClick={loadData} title="刷新" className={loading ? 'opacity-50' : ''}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-8 relative">
          {loading && !data ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm font-medium flex-col gap-3 bg-background/50 backdrop-blur-sm z-50">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              正在读取数据…
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-destructive font-medium">{error}</div>
          ) : (
            <div className="max-w-[1400px] mx-auto">
              {renderContent()}
            </div>
          )}
        </div>
      </main>

      {/* Member Modal */}
      <Dialog open={memberModal.isOpen} onOpenChange={isOpen => setMemberModal(m => ({ ...m, isOpen }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置用户权限</DialogTitle>
            <DialogDescription className="font-mono text-xs mt-1">ID: {memberModal.id}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">会员类型</label>
              <Select value={memberModal.plan} onValueChange={plan => setMemberModal(m => ({ ...m, plan: plan ?? "free" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">免费用户</SelectItem>
                  <SelectItem value="standard">标准会员</SelectItem>
                  <SelectItem value="contributor">贡献者</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">状态</label>
              <Select value={memberModal.status} onValueChange={status => setMemberModal(m => ({ ...m, status: status ?? "active" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">有效</SelectItem>
                  <SelectItem value="expired">已过期</SelectItem>
                  <SelectItem value="canceled">已取消</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2 flex flex-col">
              <label className="text-sm font-medium">有效期（留空表示长期）</label>
              <Popover modal={false}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className={`w-full justify-start text-left font-normal ${!memberModal.validUntil ? "text-muted-foreground" : ""}`}
                    />
                  }
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {memberModal.validUntil ? memberModal.validUntil : <span>选择日期</span>}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={memberModal.validUntil ? new Date(memberModal.validUntil) : undefined}
                    onSelect={(d) => setMemberModal(m => ({ ...m, validUntil: d ? format(d, "yyyy-MM-dd") : "" }))}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2 col-span-2">
              <label className="text-sm font-medium">可翻译视频数量上限</label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="留空表示不限量"
                value={memberModal.videoLimit}
                onChange={e => setMemberModal(m => ({ ...m, videoLimit: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">默认不限量；填 0 表示禁止新增视频，填正整数表示最多可翻译的不同视频数。</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveMember}>保存设置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subtitle Modal */}
      <Dialog open={subtitleModal.isOpen} onOpenChange={isOpen => setSubtitleModal(m => ({ ...m, isOpen }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>字幕审核</DialogTitle>
            <DialogDescription className="font-mono text-xs mt-1">ID: {subtitleModal.id}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">发布状态</label>
              <Select value={subtitleModal.status} onValueChange={status => setSubtitleModal(m => ({ ...m, status: status ?? "private" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['private', 'candidate', 'recommended', 'archived', 'rejected'].map(x => (
                    <SelectItem key={x} value={x}>{x}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">质量分（0–100）</label>
              <Input type="number" min="0" max="100" value={subtitleModal.score ?? ''} onChange={e => setSubtitleModal(m => ({ ...m, score: e.target.value ? Number(e.target.value) : null }))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground bg-muted p-3 rounded-md border">设为 recommended 后，该字幕会成为相同字幕源、语言和风格下的公共推荐版本。</p>
          <DialogFooter>
            <Button onClick={saveSubtitle}>保存审核</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
