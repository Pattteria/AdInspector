class AdInspector {

    constructor() {
        this.slotRenderEndedCounter = 0;
        this.slotResponseReceivedCounter = 0;

        this.slotRefreshData = {};
        this.slotRenderHistory = {};
        this.slotResponseHistory = {};

        console.log("%cAdInspector gestartet", "color:#4CAF50;font-weight:bold");
        this.init();
    }

    init() {
        setTimeout(() => {
            this.addEventListeners();
            this.windowScroller();
        }, 1500);
    }

    addEventListeners() {
        if (window.googletag?.pubads) {
            try {
                const pubads = window.googletag.pubads();
                pubads.addEventListener('slotRenderEnded', e => this.slotRenderEndedFired(e));
                pubads.addEventListener('slotResponseReceived', e => this.slotResponseReceived(e));
            } catch(e) {}
        }

        if (window.pbjs) {
            try {
                const pbjs = window.pbjs;
                pbjs.onEvent('auctionInit', (args) => this.handleAuctionInit(args));
                pbjs.onEvent('bidWon', (bid) => this.handleBidWon(bid));
            } catch(e) {}
        }
    }

    handleAuctionInit(args) {
        const adUnitCodes = args.adUnitCodes || [];
        adUnitCodes.forEach(code => {
            if (!this.slotRefreshData[code]) {
                this.slotRefreshData[code] = { refreshCount: 0, lastRefresh: Date.now() };
            }
            this.slotRefreshData[code].refreshCount++;
            this.slotRefreshData[code].lastRefresh = Date.now();
        });
    }

    handleBidWon(bid) {
        const code = bid.adUnitCode;
        if (this.slotRefreshData[code]) this.slotRefreshData[code].lastRefresh = Date.now();
    }

    slotRenderEndedFired(event) {
        this.slotRenderEndedCounter++;
        if (!event?.slot) return;

        const slotId = event.slot.getSlotElementId();
        const isEmpty = event.isEmpty;

        if (!this.slotRenderHistory[slotId]) this.slotRenderHistory[slotId] = [];
        this.slotRenderHistory[slotId].push({
            timestamp: Date.now(),
            isEmpty: isEmpty,
            status: isEmpty ? "Leer" : "Gerendert"
        });
    }

    slotResponseReceived(event) {
        this.slotResponseReceivedCounter++;
        if (!event?.slot) return;

        const slotId = event.slot.getSlotElementId();
        const responseInfo = event.slot.getResponseInformation();

        if (!this.slotResponseHistory[slotId]) this.slotResponseHistory[slotId] = [];

        this.slotResponseHistory[slotId].push({
            timestamp: Date.now(),
            responseInfo: responseInfo,
            creativeId: responseInfo ? responseInfo.creativeId : null,
            advertiserId: responseInfo ? responseInfo.advertiserId : null
        });
    }

    windowScroller() {
        let scrollPosition = 0;
        const scrollStep = 600;
        const delay = 180;

        const scrollInterval = setInterval(() => {
            scrollPosition += scrollStep;
            window.scrollTo({ top: scrollPosition, behavior: "instant" });

            const currentHeight = Math.max(
                document.body.scrollHeight || 0,
                document.documentElement.scrollHeight || 0,
                document.body.offsetHeight || 0,
                document.documentElement.offsetHeight || 0
            );

            if (scrollPosition >= currentHeight - 800) {
                clearInterval(scrollInterval);
                window.scrollTo(0, 0);
                console.log("%cScrolling abgeschlossen", "color:lime");
                setTimeout(() => this.mapOverviewData(), 2500);
            }
        }, delay);
    }

    getSlotData() {
        if (typeof googletag === 'undefined' || !googletag.apiReady) return [];
        return googletag.pubads().getSlots() || [];
    }

    getPrebidData(adUnitCode) {
        const pbjs = window.top.pbjs;
        if (!pbjs) return { bidder: "Kein Prebid", cpm: "—" };

        let winner = pbjs.getHighestCpmBids(adUnitCode)[0];

        if (!winner) {
            const responses = pbjs.getBidResponsesForAdUnitCode(adUnitCode);
            if (responses?.bids?.length) {
                winner = responses.bids.reduce((best, curr) =>
                    curr.cpm > (best.cpm || 0) ? curr : best
                );
            }
        }

        if (winner && winner.cpm) {
            return {
                bidder: winner.bidder || winner.bidderCode || "Unbekannt",
                cpm: winner.cpm.toFixed(2)
            };
        }
        return { bidder: "Kein Gebot", cpm: "—" };
    }

    getSlotStatus(slot) {
        const element = document.getElementById(slot.getSlotElementId());
        if (slot.getOutOfPage()) return "Out-of-Page";
        if (!element) return "Container nicht gefunden";
        if (!slot.getResponseInformation()) return "Wartend (Lazy)";
        if (element.offsetHeight === 0) return "Collapsed";
        return "Aktiv";
    }

    getTargetingInfo(slot) {
        try {
            const keys = slot.getTargetingKeys();
            if (!keys || keys.length === 0) return "—";
            let info = [];
            keys.forEach(key => {
                const values = slot.getTargeting(key);
                if (values && values.length > 0) {
                    info.push(`${key}=${values.join(',')}`);
                }
            });
            return info.join(' | ');
        } catch(e) {
            return "—";
        }
    }

    formatSizes(sizes) {
        if (!sizes || !Array.isArray(sizes)) return "—";
        return sizes.map(size => {
            if (Array.isArray(size) && size.length >= 2) return `${size[0]}x${size[1]}`;
            if (size && size.width && size.height) return `${size.width}x${size.height}`;
            return String(size);
        }).join(', ');
    }

    getSlotColor(index, status) {
        if (status !== "Aktiv") return "#666666";
        const colors = ['#ff4444', '#ff8800', '#ffcc00', '#44cc44', '#4488ff', '#9966ff', '#ff44aa', '#00cccc', '#ff6600', '#33aa99', '#b2e700', '#ffff84', '#b74a8a'];
        return colors[index % colors.length];
    }

    mapOverviewData() {
        try {
            const slots = this.getSlotData();

            const results = slots.map(slot => {
                const divId = slot.getSlotElementId();
                const prebid = this.getPrebidData(divId);
                const refreshInfo = this.slotRefreshData[divId] || { refreshCount: 0, lastRefresh: null };
                const renderInfo = this.slotRenderHistory[divId] || [];

                const lastRender = renderInfo.length > 0
                    ? renderInfo[renderInfo.length - 1].status
                    : "—";

                return {
                    id: divId,
                    path: slot.getAdUnitPath() || "—",
                    sizes: this.formatSizes(slot.getSizes()),
                    bidder: prebid.bidder,
                    cpm: prebid.cpm,
                    status: this.getSlotStatus(slot),
                    targeting: this.getTargetingInfo(slot),
                    refreshCount: refreshInfo.refreshCount,
                    lastRefresh: refreshInfo.lastRefresh ? new Date(refreshInfo.lastRefresh).toLocaleTimeString() : "—",
                    lastRender: lastRender,
                    renderCount: renderInfo.length
                };
            });

            AdInspectorUI.show(results);
        } catch(e) {
            console.error("Fehler in mapOverviewData:", e);
        }
    }
};

// ==================== UI ====================
const AdInspectorUI = {

    overlays: [],

    show(data) {
        try {
            this.createDraggableSidebar(data);
            this.highlightSlots(data);
        } catch(e) {
            console.error("Fehler in UI.show:", e);
        }
    },

    createDraggableSidebar(data) {
        document.getElementById('adinspector-sidebar')?.remove();

        const sidebar = document.createElement('div');
        sidebar.id = 'adinspector-sidebar';
        sidebar.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            width: 420px;
            height: 85vh;
            backdrop-filter: blur(24px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            color: #300a33;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8);
            z-index: 2147483647;
            font-family: Arial, sans-serif;
            font-size: 13px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;

        // Sticky Header
        const header = document.createElement('div');
        header.id = 'sidebar-header';
        header.style.cssText = `
            padding: 12px 16px;
            backdrop-filter: blur(24px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            border-radius: 12px 12px 0 0;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            flex-shrink: 0;
        `;

        header.innerHTML = `
            <h5 style="color: #013d45; background: rgba(200,200,200,0.85); backdrop-filter: blur(24px) saturate(120%);border-radius: 15px; padding: 8px 10px;">🔍 AdInspector</h5>
            <div style="display:flex; gap:8px;">
                <button id="export-btn" style="background:#4CAF50; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-size:12px;">
                    📥 Export JSON
                </button>
                <span onclick="this.closest('#adinspector-sidebar').remove()" style="cursor:pointer;font-size:22px;line-height:20px;">×</span>
            </div>
        `;

        // Sticky Stats Bar
        const statsBar = document.createElement('div');
        statsBar.style.cssText = `
            padding: 8px 16px;
            background: rgba(200,200,200,0.45);
            backdrop-filter: blur(42px) saturate(220%);
            color: white;
            font-size: 13px;
            flex-shrink: 0;
            padding: 8px 10px;
        `;
        statsBar.textContent = `${data.length} Werbe-Slots gefunden`;

        // Scrollbarer Inhalt
        const content = document.createElement('div');
        content.id = 'sidebar-content';
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 12px 16px;
        `;

        data.forEach((slot, index) => {
            const color = AdInspector.prototype.getSlotColor(index, slot.status);

            content.innerHTML += `
                <div class="ad-slot-entry" 
                     data-slot-id="${slot.id}"
                     style="background:rgba(225,225,225,0.85);;padding:10px;margin-bottom:8px;border-radius:6px;border-left:12px solid ${color};cursor:pointer;">
                    <strong style="color: darkblue">SlotName: ${slot.id}</strong><br>
                    <small style="color: darkblue" class="ad-meta">Path: ${slot.path}</small><br>
                    <strong style="color:${color}">Bidder: ${slot.bidder}</strong><br>
                    <strong style="color:red;padding:8px 0;">CPM: ${slot.cpm}</strong><br>
                    <small class="ad-meta">Sizes: ${slot.sizes}</small><br>
                    <small class="ad-meta">Refreshes: ${slot.refreshCount}× | Letzter: ${slot.lastRefresh}</small><br>
                    <small class="ad-meta" style="color:#6B0000">Targeting: ${slot.targeting}</small><br>
                    <strong style="color:${color}; margin:8px 0 4px 0;">Status: ${slot.status}</strong>
                </div>
            `;
        });

        sidebar.appendChild(header);
        sidebar.appendChild(statsBar);
        sidebar.appendChild(content);
        document.body.appendChild(sidebar);

        this.makeDraggable(sidebar);
        this.addSlotClickHandlers();
        this.addExportFunction(data);
    },

    addExportFunction(data) {
        const exportBtn = document.getElementById('export-btn');
        if (!exportBtn) return;

        exportBtn.addEventListener('click', () => {
            const exportData = {
                exportDate: new Date().toISOString(),
                totalSlots: data.length,
                slots: data
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ad-inspector-export-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log("%cJSON Export erfolgreich", "color:#4CAF50");
        });
    },

    makeDraggable(element) {
        const header = document.getElementById('sidebar-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = "auto";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    },

    addSlotClickHandlers() {
        document.querySelectorAll('.ad-slot-entry').forEach(entry => {
            entry.addEventListener('click', () => {
                const slotId = entry.getAttribute('data-slot-id');
                const element = document.getElementById(slotId);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "center" });
                    element.style.transition = "all 0.4s";
                    element.style.boxShadow = "0 0 0 25px rgba(255, 50, 50, 0.7)";
                    setTimeout(() => element.style.boxShadow = "none", 2500);
                }
            });
        });
    },

    highlightSlots(data) {
        this.overlays.forEach(o => o.remove());
        this.overlays = [];

        data.forEach((slot, index) => {
            const element = document.getElementById(slot.id);
            if (!element) return;

            const rect = element.getBoundingClientRect();
            if (rect.width < 50 || rect.height < 30) return;

            const color = AdInspector.prototype.getSlotColor(index, slot.status);

            const overlay = document.createElement('div');
            overlay.className = 'adinspector-overlay';
            overlay.dataset.slotId = slot.id;
            overlay.style.cssText = `
                position: absolute;
                border: 10px solid ${color};
                border-radius: 3px;
                pointer-events: none;
                z-index: 2147483646;
                box-shadow: 0 0 12px ${color}80;
                box-sizing: border-box;
            `;

            const label = document.createElement('div');
            label.style.cssText = `
                position: absolute;
                background: ${color};
                color: white;
                font-size: 12px;
                padding: 3px 8px;
                border-radius: 4px;
                white-space: nowrap;
                font-weight: bold;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            `;
            label.textContent = `${slot.bidder} • ${slot.cpm}`;

            overlay.appendChild(label);
            document.body.appendChild(overlay);
            this.overlays.push(overlay);

            this.updateOverlayPosition(overlay, element, label);
        });

        if (!window.adInspectorScrollHandler) {
            window.adInspectorScrollHandler = () => this.updateAllOverlays();
            window.addEventListener('scroll', window.adInspectorScrollHandler, { passive: true });
        }
    },

    updateOverlayPosition(overlay, element, label) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const topPos = rect.top + window.scrollY;
        const leftPos = rect.left + window.scrollX;

        overlay.style.top = topPos + "px";
        overlay.style.left = leftPos + "px";
        overlay.style.width = rect.width + "px";
        overlay.style.height = rect.height + "px";

        if (topPos < 50) {
            label.style.top = "auto";
            label.style.bottom = "-26px";
        } else {
            label.style.top = "-26px";
            label.style.bottom = "auto";
        }
    },

    updateAllOverlays() {
        this.overlays.forEach(overlay => {
            const element = document.getElementById(overlay.dataset.slotId);
            if (element) this.updateOverlayPosition(overlay, element, overlay.querySelector('div'));
        });
    }
};

new AdInspector();