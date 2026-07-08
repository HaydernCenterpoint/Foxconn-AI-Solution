--
-- PostgreSQL database dump
--

\restrict E64Zspso0RvZwoy8eEOeZRfw2AniW9CaatHiamvV1EcuORZfxNaS9dCWcLQACKa

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

-- Started on 2026-07-03 17:27:02

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5067 (class 0 OID 41036)
-- Dependencies: 236
-- Data for Name: alarms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alarms (id, machine_id, severity, message, status, acknowledged_by, acknowledged_at, resolved_at, notes, created_at) FROM stdin;
\.


--
-- TOC entry 5065 (class 0 OID 41016)
-- Dependencies: 234
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, username, action, details, created_at) FROM stdin;
1	admin	LOGIN	User logged in successfully	2026-06-17 09:50:22.549954+07
2	admin	LOGIN	User logged in successfully	2026-06-17 09:57:47.334923+07
3	admin	LOGIN	User logged in successfully	2026-06-17 09:58:30.085583+07
4	admin	LOGIN	User logged in successfully	2026-06-17 09:59:34.868233+07
5	admin	LOGIN	User logged in successfully	2026-06-17 09:59:57.047469+07
6	admin	CREATE_LINE	Tạo dây chuyền: a	2026-06-17 10:02:18.199323+07
7	admin	APPROVE_MACHINE	Duyệt máy 'May 01' (ID: de82a2c2-f508-472b-9bcc-887412fb8ca2)	2026-06-17 10:04:07.632444+07
8	admin	CREATE_LINE	Tạo dây chuyền: a	2026-06-17 10:07:41.118216+07
9	admin	UPDATE_MACHINE	Cập nhật máy ID: d6ab4761-426b-4153-b1b4-7fa8334bd720	2026-06-17 10:07:50.886053+07
10	admin	APPROVE_MACHINE	Duyệt máy 'May 01' (ID: d6ab4761-426b-4153-b1b4-7fa8334bd720)	2026-06-17 10:12:32.229595+07
11	admin	UPDATE_MACHINE	Cập nhật máy ID: d6ab4761-426b-4153-b1b4-7fa8334bd720	2026-06-17 10:12:42.187129+07
12	admin	CREATE_MACHINE	Tạo máy: a (a)	2026-06-17 10:13:03.044895+07
13	admin	CREATE_MACHINE	Tạo máy: ab (ab)	2026-06-17 10:13:12.513101+07
14	admin	REVOKE_MACHINE	Thu hồi quyền máy 'a' (ID: fd055c98-759f-4569-9723-a6b10abdcb74)	2026-06-17 10:22:19.693024+07
15	admin	REVOKE_MACHINE	Thu hồi quyền máy 'ab' (ID: 1181d7c2-9c4a-4467-882a-870d8bef18ec)	2026-06-17 10:22:20.607567+07
16	admin	APPROVE_MACHINE	Duyệt máy 'a' (ID: fd055c98-759f-4569-9723-a6b10abdcb74)	2026-06-17 10:22:29.700668+07
17	admin	APPROVE_MACHINE	Duyệt máy 'ab' (ID: 1181d7c2-9c4a-4467-882a-870d8bef18ec)	2026-06-17 10:22:29.995991+07
18	admin	REVOKE_MACHINE	Thu hồi quyền máy 'ab' (ID: 1181d7c2-9c4a-4467-882a-870d8bef18ec)	2026-06-17 10:22:30.371063+07
19	admin	APPROVE_MACHINE	Duyệt máy 'ab' (ID: 1181d7c2-9c4a-4467-882a-870d8bef18ec)	2026-06-17 10:22:30.827626+07
20	guest	LOGIN_FAILED	Failed login attempt	2026-06-17 10:24:29.924785+07
21	guest	LOGIN_FAILED	Failed login attempt	2026-06-17 10:24:34.313089+07
22	guest	LOGIN_FAILED	Failed login attempt	2026-06-17 10:24:36.286834+07
23	gues	LOGIN_FAILED	Failed login attempt	2026-06-17 10:24:39.76685+07
24	guest	LOGIN_FAILED	Failed login attempt	2026-06-17 10:24:41.302487+07
25	guest	LOGIN_FAILED	Failed login attempt	2026-06-17 10:24:45.318209+07
26	guest	LOGIN_FAILED	Failed login attempt	2026-06-17 10:24:46.207327+07
27	guest	LOGIN_FAILED	Failed login attempt	2026-06-17 10:24:46.382215+07
28	guest	LOGIN_FAILED	Failed login attempt	2026-06-17 10:24:46.551442+07
29	engineer	LOGIN	User logged in successfully	2026-06-18 10:15:03.114243+07
30	admin	LOGIN	User logged in successfully	2026-06-18 10:15:19.550884+07
31	admin	LOGIN	User logged in successfully	2026-06-18 10:20:20.655116+07
32	admin	LOGIN	User logged in successfully	2026-06-19 08:27:25.276444+07
33	admin	LOGIN	User logged in successfully	2026-06-19 10:10:32.307732+07
34	admin	LOGIN	User logged in successfully	2026-06-19 12:32:42.492155+07
35	admin	LOGIN	User logged in successfully	2026-06-19 14:59:36.581843+07
36	admin	LOGIN	User logged in successfully	2026-06-20 16:30:54.721506+07
37	admin	LOGIN	User logged in successfully	2026-06-22 09:45:43.889583+07
38	admin	LOGIN	User logged in successfully	2026-06-22 09:46:43.455255+07
39	admin	LOGIN	User logged in successfully	2026-06-22 09:47:18.099584+07
40	admin	LOGIN	User logged in successfully	2026-06-22 10:09:22.553993+07
41	admin	LOGIN	User logged in successfully	2026-06-22 10:12:49.063237+07
42	admin	LOGIN	User logged in successfully	2026-06-22 10:15:00.530106+07
43	admin	LOGIN	User logged in successfully	2026-06-22 10:29:03.64114+07
44	admin	LOGIN	User logged in successfully	2026-06-23 17:36:46.212954+07
45	admin	LOGIN	User logged in successfully	2026-06-24 16:27:00.973641+07
46	admin	LOGIN	User logged in successfully	2026-06-24 16:59:17.873928+07
47	admin	LOGIN	User logged in successfully	2026-06-26 07:58:45.665532+07
48	admin	LOGIN	User logged in successfully	2026-06-26 09:24:56.800692+07
49	admin	LOGIN	User logged in successfully	2026-06-26 13:21:21.946203+07
50	admin	LOGIN	User logged in successfully	2026-06-26 15:19:36.304185+07
51	admin	UPDATE_MACHINE	Cập nhật máy ID: d6ab4761-426b-4153-b1b4-7fa8334bd720	2026-06-26 15:37:06.959788+07
52	admin	LOGIN	User logged in successfully	2026-06-26 16:02:29.282277+07
53	admin	LOGIN	User logged in successfully	2026-06-26 16:02:37.989061+07
54	admin	LOGIN	User logged in successfully	2026-06-26 16:02:50.022792+07
55	admin	LOGIN	User logged in successfully	2026-06-26 16:03:13.737809+07
56	admin	LOGIN	User logged in successfully	2026-06-26 16:03:16.679223+07
57	admin	CREATE_LINE	Tạo dây chuyền: Line B	2026-06-26 16:26:43.371809+07
58	admin	CREATE_MACHINE	Tạo máy: May 02 (MAY-02)	2026-06-26 16:28:11.587652+07
59	admin	LOGIN	User logged in successfully	2026-06-26 16:52:45.768652+07
60	admin	LOGIN	User logged in successfully	2026-06-27 07:58:04.847576+07
61	admin	LOGIN	User logged in successfully	2026-06-27 10:00:06.692844+07
62	admin	LOGIN	User logged in successfully	2026-06-29 10:06:54.227751+07
63	admin	LOGIN	User logged in successfully	2026-06-29 13:34:40.995284+07
64	admin	LOGIN	User logged in successfully	2026-06-30 09:31:30.405142+07
65	admin	LOGIN	User logged in successfully	2026-06-30 09:55:24.436212+07
66	admin	LOGIN	User logged in successfully	2026-06-30 13:31:16.684321+07
67	admin	LOGIN	User logged in successfully	2026-06-30 14:03:00.939616+07
68	admin	LOGIN	User logged in successfully	2026-07-03 13:15:40.910902+07
69	admin	REVOKE_MACHINE	Thu hồi quyền máy 'May 02' (ID: 8330449c-0e6e-4529-98ce-5f9f94da1a81)	2026-07-03 14:19:14.927938+07
70	admin	APPROVE_MACHINE	Duyệt máy 'May 02' (ID: 8330449c-0e6e-4529-98ce-5f9f94da1a81)	2026-07-03 14:19:16.611553+07
71	admin	LOGIN	User logged in successfully	2026-07-03 15:51:22.5533+07
72	admin	LOGIN	User logged in successfully	2026-07-03 16:20:07.492174+07
73	admin	LOGIN	User logged in successfully	2026-07-03 16:24:42.466167+07
\.


--
-- TOC entry 5052 (class 0 OID 16501)
-- Dependencies: 221
-- Data for Name: line_machines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.line_machines (line_id, machine_id, sequence_order) FROM stdin;
ec7f2a26-0312-4d5b-826a-1c9b358992d1	d6ab4761-426b-4153-b1b4-7fa8334bd720	4
39b60138-6a93-4da9-89b4-159f49137a33	8330449c-0e6e-4529-98ce-5f9f94da1a81	1
\.


--
-- TOC entry 5061 (class 0 OID 24617)
-- Dependencies: 230
-- Data for Name: machine_alarms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machine_alarms (id, machine_id, client_id, alarm_code, alarm_message, severity, is_active, triggered_at, resolved_at, message_id) FROM stdin;
\.


--
-- TOC entry 5054 (class 0 OID 16520)
-- Dependencies: 223
-- Data for Name: machine_hourly_production; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machine_hourly_production (id, machine_id, prod_date, prod_hour, produced_qty_start, produced_qty_end, hourly_qty, plc_run_time_start, plc_run_time_end, avg_cpu, avg_ram, received_at, last_raw_qty, oee_availability) FROM stdin;
9	d6ab4761-426b-4153-b1b4-7fa8334bd720	2026-06-26	15	0	0	0	0	0	3.4	92.24	2026-06-26 15:37:05.240465+07	0	0
8	d6ab4761-426b-4153-b1b4-7fa8334bd720	2026-06-17	10	0	0	0	0	0	0.06	87.11	2026-06-17 10:48:42.825599+07	0	0
11	d6ab4761-426b-4153-b1b4-7fa8334bd720	2026-06-26	17	0	0	0	0	0	0.13	93.47	2026-06-26 17:03:21.555094+07	0	0
10	d6ab4761-426b-4153-b1b4-7fa8334bd720	2026-06-26	16	0	0	0	0	0	0	95.3	2026-06-26 16:59:59.737321+07	0	0
\.


--
-- TOC entry 5072 (class 0 OID 57365)
-- Dependencies: 241
-- Data for Name: machine_telemetry; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machine_telemetry (id, machine_id, raw_json, sequence, created_at) FROM stdin;
\.


--
-- TOC entry 5070 (class 0 OID 49173)
-- Dependencies: 239
-- Data for Name: machine_telemetry_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machine_telemetry_history (id, machine_id, status, plc_connected, production_count, cycle_time, cpu_percent, ram_percent, uptime_seconds, tags, created_at) FROM stdin;
\.


--
-- TOC entry 5051 (class 0 OID 16491)
-- Dependencies: 220
-- Data for Name: machines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.machines (id, name, ip, status, created_at, last_plc_data, is_approved, plc_brand, plc_ip, plc_port, read_addresses, plc_client_id, production_count, machine_runtime_seconds, last_telemetry_at, client_id, plc_connected, machine_code, approval_status, cpu_percent, ram_percent, uptime_seconds, last_heartbeat, name_translations) FROM stdin;
d6ab4761-426b-4153-b1b4-7fa8334bd720	May 01	127.0.0.1	OFFLINE	2026-06-17 10:06:20.293733+07	{"machineId":"d6ab4761-426b-4153-b1b4-7fa8334bd720","machineName":"May 01","lineId":"line-01","sequence":1,"status":"OFFLINE","plcConnected":false,"productionCount":0,"clientUptimeSeconds":3731,"computer":{"cpuPercent":0,"ramPercent":93.6,"ramUsedMb":7374,"uptimeSeconds":3731},"alarm":{"active":false,"code":null,"message":null},"tags":{},"statusObj":{"start":false,"stop":true,"error":false},"machine":{"cpu":0,"ram":93.6,"uptime":3731},"production":{"qty":0,"time":0},"error":[]}	f	\N	\N	\N	\N	\N	0	0	\N	d6ab4761-426b-4153-b1b4-7fa8334bd720	f	\N	APPROVED	0	93.6	3731	2026-06-26 17:03:21.55417+07	{"en": "May 01", "vi": "May 01", "zh-CN": "May 01"}
8330449c-0e6e-4529-98ce-5f9f94da1a81	May 02	127.0.0.2	offline	2026-06-26 16:28:11.519505+07	\N	f	\N	\N	\N	\N	\N	0	0	\N	may-02-client	f	MAY-02	APPROVED	0	0	0	\N	{"en": "May 02", "vi": "May 02", "zh-CN": "May 02"}
\.


--
-- TOC entry 5059 (class 0 OID 24605)
-- Dependencies: 228
-- Data for Name: plc_client_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.plc_client_sessions (id, client_id, session_id, remote_ip, connected_at, disconnected_at, last_heartbeat_at, disconnect_reason, client_version) FROM stdin;
1	822716af-270a-4f0e-b3df-7d2132af5d67	25948b9a-30a6-4553-a916-275baaad6691	127.0.0.1	2026-06-09 13:19:30.433177+07	2026-06-09 13:19:40.568628+07	\N	TCP disconnected	1.0.0
2	822716af-270a-4f0e-b3df-7d2132af5d67	11d50fca-b525-4997-8cac-63f49dec62e3	127.0.0.1	2026-06-09 13:21:00.903817+07	2026-06-09 13:21:33.928665+07	\N	Heartbeat timeout	1.0.0
19	822716af-270a-4f0e-b3df-7d2132af5d67	879c9dac-061c-4834-b1ac-aeaeb2d67828	127.0.0.1	2026-06-09 13:31:54.966073+07	2026-06-09 13:32:34.727662+07	\N	TCP disconnected	1.0.0
3	822716af-270a-4f0e-b3df-7d2132af5d67	4313e65f-275a-4b8d-a385-e6e9c1bc7e06	127.0.0.1	2026-06-09 13:21:34.22229+07	2026-06-09 13:22:13.970158+07	\N	Heartbeat timeout	1.0.0
4	822716af-270a-4f0e-b3df-7d2132af5d67	0cf1b1f6-5164-44b0-8485-6d244a6b5b33	127.0.0.1	2026-06-09 13:22:14.636485+07	2026-06-09 13:22:53.98699+07	\N	Heartbeat timeout	1.0.0
31	822716af-270a-4f0e-b3df-7d2132af5d67	5c829dff-99de-4687-8eef-235ae6749d6a	127.0.0.1	2026-06-09 13:38:55.802713+07	2026-06-09 13:39:35.184278+07	\N	TCP disconnected	1.0.0
5	822716af-270a-4f0e-b3df-7d2132af5d67	ab341075-02b7-484d-bdc9-5ad5e0caafaf	127.0.0.1	2026-06-09 13:22:54.985909+07	2026-06-09 13:23:34.011398+07	\N	Heartbeat timeout	1.0.0
20	822716af-270a-4f0e-b3df-7d2132af5d67	08b7619a-6dbb-470e-b085-68a0f4f9e3f4	127.0.0.1	2026-06-09 13:32:35.413742+07	2026-06-09 13:33:14.764555+07	\N	TCP disconnected	1.0.0
6	822716af-270a-4f0e-b3df-7d2132af5d67	8a72cd34-4e44-45ba-b442-fc3601a14ec4	127.0.0.1	2026-06-09 13:23:34.400145+07	2026-06-09 13:24:14.108929+07	\N	TCP disconnected	1.0.0
7	822716af-270a-4f0e-b3df-7d2132af5d67	89cb0a23-d6bb-41b5-ae3d-11d02886f450	127.0.0.1	2026-06-09 13:24:18.293395+07	2026-06-09 13:24:54.105996+07	\N	TCP disconnected	1.0.0
8	822716af-270a-4f0e-b3df-7d2132af5d67	ef75b1d5-efd3-4af8-8545-3fc4037ea0eb	127.0.0.1	2026-06-09 13:24:54.729871+07	2026-06-09 13:25:34.133805+07	\N	TCP disconnected	1.0.0
21	822716af-270a-4f0e-b3df-7d2132af5d67	4bb5fd6d-b0b2-4918-9e7e-8ec82a33a86b	127.0.0.1	2026-06-09 13:33:14.86425+07	2026-06-09 13:33:54.82606+07	\N	TCP disconnected	1.0.0
9	822716af-270a-4f0e-b3df-7d2132af5d67	50e5610d-5653-4d15-bc99-754dda5c4c32	127.0.0.1	2026-06-09 13:25:35.125151+07	2026-06-09 13:26:14.18274+07	\N	TCP disconnected	1.0.0
10	822716af-270a-4f0e-b3df-7d2132af5d67	d468976f-273b-4daf-9ba2-2b3a596d159f	127.0.0.1	2026-06-09 13:26:14.493066+07	2026-06-09 13:26:54.22086+07	\N	Heartbeat timeout	1.0.0
11	822716af-270a-4f0e-b3df-7d2132af5d67	725500ea-07e8-46a2-adb5-544e90f5a6b3	127.0.0.1	2026-06-09 13:26:54.884537+07	2026-06-09 13:27:34.263675+07	\N	Heartbeat timeout	1.0.0
22	822716af-270a-4f0e-b3df-7d2132af5d67	d9040fad-cf2b-422f-807a-19ee167e873e	127.0.0.1	2026-06-09 13:33:55.395468+07	2026-06-09 13:34:34.832356+07	\N	Heartbeat timeout	1.0.0
12	822716af-270a-4f0e-b3df-7d2132af5d67	1a8abf97-3352-4133-a539-40496b30ab82	127.0.0.1	2026-06-09 13:27:35.278794+07	2026-06-09 13:28:14.326481+07	\N	TCP disconnected	1.0.0
13	822716af-270a-4f0e-b3df-7d2132af5d67	75412b43-028e-4b3e-bc89-3be92eebb13e	127.0.0.1	2026-06-09 13:28:14.733253+07	2026-06-09 13:28:54.408477+07	\N	Heartbeat timeout	1.0.0
32	822716af-270a-4f0e-b3df-7d2132af5d67	b2a21f08-7c06-40d5-9702-a54abddf021b	127.0.0.1	2026-06-09 13:39:35.205755+07	2026-06-09 13:40:05.213393+07	\N	Heartbeat timeout	1.0.0
14	822716af-270a-4f0e-b3df-7d2132af5d67	d4097b20-4005-49a8-9861-4e54d5ce681c	127.0.0.1	2026-06-09 13:28:55.115398+07	2026-06-09 13:29:34.477553+07	\N	TCP disconnected	1.0.0
23	822716af-270a-4f0e-b3df-7d2132af5d67	e8b4f024-bc99-48a3-8ebc-3e91d2aba9b4	127.0.0.1	2026-06-09 13:34:34.842445+07	2026-06-09 13:35:04.873936+07	\N	Heartbeat timeout	1.0.0
15	822716af-270a-4f0e-b3df-7d2132af5d67	27103ac5-2a92-424f-949f-2835aaa52b2a	127.0.0.1	2026-06-09 13:29:34.493079+07	2026-06-09 13:30:04.514016+07	\N	Heartbeat timeout	1.0.0
16	822716af-270a-4f0e-b3df-7d2132af5d67	749fa60b-e4c7-456a-a975-f2ca8080ce0e	127.0.0.1	2026-06-09 13:30:04.832214+07	2026-06-09 13:30:44.574957+07	\N	TCP disconnected	1.0.0
17	822716af-270a-4f0e-b3df-7d2132af5d67	2bf30ed0-d0e0-4ae7-9674-eaec56812902	127.0.0.1	2026-06-09 13:30:45.225407+07	2026-06-09 13:31:24.63347+07	\N	TCP disconnected	1.0.0
24	822716af-270a-4f0e-b3df-7d2132af5d67	7ba9ec0f-4548-4cd3-8fba-a32f75270fa8	127.0.0.1	2026-06-09 13:35:05.227474+07	2026-06-09 13:35:44.909328+07	\N	TCP disconnected	1.0.0
18	822716af-270a-4f0e-b3df-7d2132af5d67	b3e008f2-13fc-42a3-bdd2-aa2d904909fb	127.0.0.1	2026-06-09 13:31:24.653096+07	2026-06-09 13:31:54.683234+07	\N	TCP disconnected	1.0.0
33	822716af-270a-4f0e-b3df-7d2132af5d67	5f2f21ab-9102-4c05-b401-d892768f0dd7	127.0.0.1	2026-06-09 13:40:05.485037+07	2026-06-09 13:40:30.782035+07	\N	TCP disconnected	1.0.0
25	822716af-270a-4f0e-b3df-7d2132af5d67	2754763a-00d0-4cab-b927-a3eed3c2fcbb	127.0.0.1	2026-06-09 13:35:45.608771+07	2026-06-09 13:36:24.964221+07	\N	Heartbeat timeout	1.0.0
26	822716af-270a-4f0e-b3df-7d2132af5d67	6e5a4148-e4ab-47f0-8f93-1d8db3d7df5f	127.0.0.1	2026-06-09 13:36:24.997449+07	2026-06-09 13:37:05.001809+07	\N	TCP disconnected	1.0.0
27	822716af-270a-4f0e-b3df-7d2132af5d67	fe46b2bf-3f06-4f44-ab71-9056bad4e2d2	127.0.0.1	2026-06-09 13:37:05.404387+07	2026-06-09 13:37:24.32494+07	\N	TCP disconnected	1.0.0
28	822716af-270a-4f0e-b3df-7d2132af5d67	9cad0309-5e59-41d6-bcb9-c18884489415	127.0.0.1	2026-06-09 13:37:31.682994+07	2026-06-09 13:37:34.710039+07	\N	TCP disconnected	1.0.0
29	822716af-270a-4f0e-b3df-7d2132af5d67	0d58714b-5668-4f6e-b245-2d37680cff02	127.0.0.1	2026-06-09 13:37:44.119547+07	2026-06-09 13:38:15.059032+07	\N	TCP disconnected	1.0.0
34	822716af-270a-4f0e-b3df-7d2132af5d67	32f1bcbf-a198-4179-875a-ea5f09f3df47	127.0.0.1	2026-06-09 13:40:44.065434+07	2026-06-09 13:41:15.274259+07	\N	TCP disconnected	1.0.0
30	822716af-270a-4f0e-b3df-7d2132af5d67	e370c01b-77b2-4505-bddb-f216075d4357	127.0.0.1	2026-06-09 13:38:15.419678+07	2026-06-09 13:38:55.137313+07	\N	Heartbeat timeout	1.0.0
35	822716af-270a-4f0e-b3df-7d2132af5d67	5c52c0fc-a65b-499e-b42c-cfbdbdba3c42	127.0.0.1	2026-06-09 13:41:15.381086+07	2026-06-09 13:41:18.003057+07	\N	TCP disconnected	1.0.0
36	822716af-270a-4f0e-b3df-7d2132af5d67	ea8d9649-bfbb-4a3c-8dd1-3f68e5785de1	127.0.0.1	2026-06-09 13:41:23.78482+07	2026-06-09 13:41:51.445079+07	\N	TCP disconnected	1.0.0
\.


--
-- TOC entry 5057 (class 0 OID 24586)
-- Dependencies: 226
-- Data for Name: plc_clients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.plc_clients (client_id, client_name, token, machine_ids, is_active, status, last_seen_at, client_version, computer_name, remote_ip, created_at, approval_status, machine_id) FROM stdin;
\.


--
-- TOC entry 5050 (class 0 OID 16480)
-- Dependencies: 219
-- Data for Name: production_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.production_lines (id, name, description, created_at, is_active, name_translations, description_translations) FROM stdin;
ec7f2a26-0312-4d5b-826a-1c9b358992d1	a	\N	2026-06-17 10:07:41.077029+07	t	\N	\N
39b60138-6a93-4da9-89b4-159f49137a33	Line B	Description of Line B	2026-06-26 16:26:43.168563+07	t	{"en": "Line B", "vi": "Dây chuyền B", "zh-CN": "生产线 B"}	{"en": "Description of Line B", "vi": "Description of Dây chuyền B", "zh-CN": "Description of 生产线 B"}
\.


--
-- TOC entry 5068 (class 0 OID 41056)
-- Dependencies: 237
-- Data for Name: simulation_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.simulation_configs (id, machine_id, enabled, temperature_min, temperature_max, pressure_min, pressure_max, speed_min, speed_max, production_rate, error_probability, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5063 (class 0 OID 24634)
-- Dependencies: 232
-- Data for Name: tcp_message_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tcp_message_logs (id, message_id, client_id, machine_id, message_type, success, error_message, sent_at, received_at) FROM stdin;
\.


--
-- TOC entry 5056 (class 0 OID 16543)
-- Dependencies: 225
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, password, role) FROM stdin;
1	admin	240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9	ADMIN
2	engineer	80ca306ac6e68366dd0a26125c9647e0c61fac6668cec6016f5fe30fb12e99bd	ENGINEER
3	viewer	65375049b9e4d7cad6c9ba286fdeb9394b28135a3e84136404cfccfdcc438894	GUEST
\.


--
-- TOC entry 5087 (class 0 OID 0)
-- Dependencies: 235
-- Name: alarms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.alarms_id_seq', 1, false);


--
-- TOC entry 5088 (class 0 OID 0)
-- Dependencies: 233
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 73, true);


--
-- TOC entry 5089 (class 0 OID 0)
-- Dependencies: 229
-- Name: machine_alarms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.machine_alarms_id_seq', 1, false);


--
-- TOC entry 5090 (class 0 OID 0)
-- Dependencies: 222
-- Name: machine_hourly_production_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.machine_hourly_production_id_seq', 11, true);


--
-- TOC entry 5091 (class 0 OID 0)
-- Dependencies: 238
-- Name: machine_telemetry_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.machine_telemetry_history_id_seq', 1, false);


--
-- TOC entry 5092 (class 0 OID 0)
-- Dependencies: 240
-- Name: machine_telemetry_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.machine_telemetry_id_seq', 1, false);


--
-- TOC entry 5093 (class 0 OID 0)
-- Dependencies: 227
-- Name: plc_client_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.plc_client_sessions_id_seq', 36, true);


--
-- TOC entry 5094 (class 0 OID 0)
-- Dependencies: 231
-- Name: tcp_message_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tcp_message_logs_id_seq', 1, false);


--
-- TOC entry 5095 (class 0 OID 0)
-- Dependencies: 224
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


-- Completed on 2026-07-03 17:27:02

--
-- PostgreSQL database dump complete
--

\unrestrict E64Zspso0RvZwoy8eEOeZRfw2AniW9CaatHiamvV1EcuORZfxNaS9dCWcLQACKa

