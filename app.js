// PAMB Minutes & Resolutions Dashboard — GitHub Pages frontend
// Paste your Apps Script Web App URL ending in /exec below.
const API_URL = 'https://script.google.com/macros/s/AKfycbzlEzbArHbU6IMp4u0F3ZKR3BSwagaN4j99PcNBtzGXocW8WZHJTm400hEJTeFHpEz90A/exec';

let rawDataset = [];
    let filteredDataset = [];
    let resizeTimer = null;

    google.charts.load('current', { packages: ['corechart', 'table'] });
    google.charts.setOnLoadCallback(() => {
      fetchData();
      startLiveClock();
    });

    function startLiveClock() {
      function updateClock() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;

        document.getElementById('live-time').innerText = `${hours}:${minutes}:${seconds} ${ampm}`;
        document.getElementById('live-date').innerText = now.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        }).toUpperCase();
      }

      updateClock();
      setInterval(updateClock, 1000);
    }

    function fetchData() {
      document.getElementById('loader').classList.remove('d-none');
      document.getElementById('dashboard-content').classList.add('d-none');
      document.getElementById('loader').innerHTML = '<div class="spinner-border text-success" style="width:3rem;height:3rem" role="status"></div><p class="mt-3 fw-medium text-secondary">Fetching records from spreadsheet...</p>';

      if (!API_URL || API_URL.includes('PASTE_YOUR_APPS_SCRIPT_WEB_APP_EXEC_URL_HERE')) {
        handleError({message: 'Please add your Apps Script Web App /exec URL in app.js.'});
        return;
      }

      const old = document.getElementById('pamb-data-request');
      if (old) old.remove();
      let finished = false;
      const timeoutId = setTimeout(() => {
        if (finished) return;
        finished = true;
        handleError({message: 'The data request timed out. Check the Web App URL and deployment access settings.'});
      }, 20000);

      window.pambDashboardDataCallback = function(data) {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        onDataLoaded(data);
      };

      const script = document.createElement('script');
      script.id = 'pamb-data-request';
      script.onerror = function() {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        handleError({message: 'Could not load data from Apps Script. Verify the /exec URL and deployment permissions.'});
      };
      script.src = API_URL + (API_URL.includes('?') ? '&' : '?') + 'action=data&callback=pambDashboardDataCallback&_=' + Date.now();
      document.body.appendChild(script);
    }

    function onDataLoaded(data) {
      document.getElementById('loader').classList.add('d-none');
      document.getElementById('dashboard-content').classList.remove('d-none');

      if (!data || !data.rows || data.rows.length === 0) {
        document.getElementById('dashboard-content').innerHTML =
          '<div class="alert alert-warning m-4">No records found across the spreadsheet tabs.</div>';
        return;
      }

      rawDataset = data.rows;
      filteredDataset = [...rawDataset];
      populateDropdowns(rawDataset);
      updateDashboard();

      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => renderCharts(filteredDataset), 150);
      });
    }

    function populateDropdowns(rows) {
      const yearSet = new Set();
      const paSet = new Set();
      const statusSet = new Set();

      rows.forEach(r => {
        if (r[0] && String(r[0]).length === 4) yearSet.add(String(r[0]));
        if (r[1]) paSet.add(String(r[1]));
        if (r[4]) statusSet.add(String(r[4]));
      });

      const yearSelect = document.getElementById('year-filter');
      yearSelect.innerHTML = '<option value="ALL">All Years</option>';
      Array.from(yearSet).sort((a, b) => Number(b) - Number(a)).forEach(yr => {
        const opt = document.createElement('option');
        opt.value = yr;
        opt.textContent = yr;
        yearSelect.appendChild(opt);
      });

      const paSelect = document.getElementById('pa-filter');
      paSelect.innerHTML = '<option value="ALL">All Protected Areas</option>';
      Array.from(paSet).sort().forEach(pa => {
        const opt = document.createElement('option');
        opt.value = pa;
        opt.textContent = pa;
        paSelect.appendChild(opt);
      });

      const statusSelect = document.getElementById('status-filter');
      statusSelect.innerHTML = '<option value="ALL">All Remarks</option>';
      Array.from(statusSet).sort().forEach(st => {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        statusSelect.appendChild(opt);
      });
    }

    function getDocumentType(title) {
      const text = String(title || '').toLowerCase();
      if (text.includes('minutes')) return 'Minutes';
      if (text.includes('resolution')) return 'Resolution';
      return 'Other';
    }

    function applyFilters() {
      const query = document.getElementById('search-query').value.toLowerCase().trim();
      const selectedType = document.getElementById('type-filter').value;
      const selectedYear = document.getElementById('year-filter').value;
      const selectedPA = document.getElementById('pa-filter').value;
      const selectedStatus = document.getElementById('status-filter').value;

      filteredDataset = rawDataset.filter(r => {
        const titleText = String(r[2] || '').toLowerCase();
        const paText = String(r[1] || '').toLowerCase();
        const remarksText = String(r[4] || '').toLowerCase();
        const queryMatch = !query || titleText.includes(query) || paText.includes(query) || remarksText.includes(query);
        const typeMatch = selectedType === 'ALL' || getDocumentType(r[2]) === selectedType;
        const yearMatch = selectedYear === 'ALL' || String(r[0]) === selectedYear;
        const paMatch = selectedPA === 'ALL' || String(r[1]) === selectedPA;
        const statusMatch = selectedStatus === 'ALL' || String(r[4]) === selectedStatus;
        return queryMatch && typeMatch && yearMatch && paMatch && statusMatch;
      });

      updateDashboard();
    }

    function resetFilters() {
      document.getElementById('search-query').value = '';
      document.getElementById('type-filter').value = 'ALL';
      document.getElementById('year-filter').value = 'ALL';
      document.getElementById('pa-filter').value = 'ALL';
      document.getElementById('status-filter').value = 'ALL';
      filteredDataset = [...rawDataset];
      updateDashboard();
    }

    function updateDashboard() {
      calculateKPIs(filteredDataset);
      renderCharts(filteredDataset);
      drawMobileDocuments(filteredDataset);
      document.getElementById('results-count').innerText = `${filteredDataset.length.toLocaleString()} record${filteredDataset.length === 1 ? '' : 's'}`;
    }

    function calculateKPIs(rows) {
      const total = rows.length;
      let approved = 0;
      rows.forEach(r => {
        if (String(r[4] || '').toLowerCase() === 'approved') approved++;
      });

      const rate = total > 0 ? ((approved / total) * 100).toFixed(1) : '0';
      document.getElementById('kpi-total').innerText = total.toLocaleString();
      document.getElementById('kpi-approved').innerText = approved.toLocaleString();
      document.getElementById('kpi-rate').innerText = rate + '%';
    }

    function renderCharts(rows) {
      drawPAChart(rows);
      drawRemarksChart(rows);
      drawTable(rows);
    }

    function drawPAChart(rows) {
      const paCounts = {};
      rows.forEach(r => {
        const pa = r[1] || 'Unspecified';
        paCounts[pa] = (paCounts[pa] || 0) + 1;
      });

      const dataTable = new google.visualization.DataTable();
      dataTable.addColumn('string', 'Protected Area');
      dataTable.addColumn('number', 'Documents');

      Object.keys(paCounts).sort().forEach(pa => dataTable.addRow([pa, paCounts[pa]]));

      const isMobile = window.innerWidth < 768;
      const options = {
        fontName: 'Montserrat',
        legend: { position: 'none' },
        hAxis: {
          title: isMobile ? '' : 'Protected Area',
          fontName: 'Montserrat',
          textStyle: { color: '#1e293b', fontSize: isMobile ? 9 : 11 },
          slantedText: isMobile,
          slantedTextAngle: 45
        },
        vAxis: {
          title: isMobile ? '' : 'Document Count',
          minValue: 0,
          fontName: 'Montserrat',
          textStyle: { color: '#1e293b', fontSize: isMobile ? 9 : 11 }
        },
        colors: ['#0d8a4f'],
        chartArea: isMobile ? { left: 38, top: 15, width: '88%', height: '70%' } : { width: '80%', height: '70%' },
        bar: { groupWidth: isMobile ? '55%' : '65%' }
      };

      new google.visualization.ColumnChart(document.getElementById('pa_chart')).draw(dataTable, options);
    }

    function drawRemarksChart(rows) {
      const remarksCounts = {};
      rows.forEach(r => {
        const rem = r[4] || 'Pending';
        remarksCounts[rem] = (remarksCounts[rem] || 0) + 1;
      });

      const dataTable = new google.visualization.DataTable();
      dataTable.addColumn('string', 'Status');
      dataTable.addColumn('number', 'Count');

      const colorMap = {
        'Approved': '#0d8a4f',
        'Pending': '#f59e0b',
        'For Approval': '#3b82f6',
        'For Deliberation': '#ef4444',
        'For Redeliberation': '#8b5cf6',
        'Back to PAMO': '#14b8a6',
        'For revision (PAMO)': '#f43f5e',
        'Other': '#d1d5db'
      };

      const chartColors = [];
      Object.keys(remarksCounts).sort().forEach(rem => {
        dataTable.addRow([rem, remarksCounts[rem]]);
        chartColors.push(colorMap[rem] || '#94a3b8');
      });

      const isMobile = window.innerWidth < 768;
      const options = {
        fontName: 'Montserrat',
        pieHole: 0.45,
        chartArea: isMobile ? { width: '75%', height: '72%', left: '3%', top: '5%' } : { width: '85%', height: '80%', left: '10%' },
        colors: chartColors,
        legend: {
          position: isMobile ? 'bottom' : 'right',
          alignment: 'center',
          textStyle: { fontName: 'Montserrat', fontSize: isMobile ? 9 : 12, color: '#1e293b' }
        }
      };

      new google.visualization.PieChart(document.getElementById('remarks_chart')).draw(dataTable, options);
    }

    function drawTable(rows) {
      const tableData = new google.visualization.DataTable();
      tableData.addColumn('string', 'Protected Area');
      tableData.addColumn('string', 'Type');
      tableData.addColumn('string', 'Resolution / Minutes Title');
      tableData.addColumn('string', 'PDF Link');
      tableData.addColumn('string', 'Remarks');

      rows.forEach(r => {
        const pa = String(r[1] || 'Unspecified');
        const title = String(r[2] || '');
        const type = getDocumentType(title);
        const linkUrl = String(r[3] || '');
        const remarks = String(r[4] || 'Pending');

        let linkHtml = '<span class="text-muted">No File</span>';
        if (linkUrl) {
          linkHtml = `<a href="${escapeAttribute(linkUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-pdf-green"><i class="bi bi-file-earmark-pdf me-1"></i>Open PDF</a>`;
        }

        tableData.addRow([pa, type, title, linkHtml, remarks]);
      });

      new google.visualization.Table(document.getElementById('table_chart')).draw(tableData, {
        allowHtml: true,
        page: 'enable',
        pageSize: 10,
        width: '100%',
        sort: 'disable'
      });
    }

    function drawMobileDocuments(rows) {
      const container = document.getElementById('mobile-documents');
      container.innerHTML = '';

      if (!rows.length) {
        container.innerHTML = '<div class="alert alert-warning mb-0">No matching records found.</div>';
        return;
      }

      rows.forEach(r => {
        const pa = String(r[1] || 'Unspecified');
        const title = String(r[2] || 'Untitled document');
        const type = getDocumentType(title);
        const remarks = String(r[4] || 'Pending');
        const linkUrl = String(r[3] || '');

        const card = document.createElement('div');
        card.className = 'mobile-doc-card';

        const paEl = document.createElement('div');
        paEl.className = 'mobile-doc-pa';
        paEl.textContent = pa;

        const typeEl = document.createElement('div');
        typeEl.className = 'mobile-doc-type' + (type === 'Minutes' ? ' minutes' : '');
        typeEl.innerHTML = type === 'Minutes'
          ? '<i class="bi bi-journal-text me-1"></i> MINUTES'
          : type === 'Resolution'
            ? '<i class="bi bi-file-earmark-text me-1"></i> RESOLUTION'
            : '<i class="bi bi-file-earmark me-1"></i> OTHER';

        const titleEl = document.createElement('div');
        titleEl.className = 'mobile-doc-title';
        titleEl.textContent = title;

        const remarkEl = document.createElement('div');
        remarkEl.className = 'mobile-doc-remark';
        remarkEl.textContent = 'Remarks: ' + remarks;

        card.appendChild(paEl);
        card.appendChild(typeEl);
        card.appendChild(titleEl);
        card.appendChild(remarkEl);

        if (linkUrl) {
          const link = document.createElement('a');
          link.href = linkUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'btn btn-pdf-green';
          link.innerHTML = '<i class="bi bi-file-earmark-pdf me-1"></i> Open PDF';
          card.appendChild(link);
        } else {
          const noFile = document.createElement('div');
          noFile.className = 'text-muted small mt-2';
          noFile.innerHTML = '<i class="bi bi-file-earmark-x me-1"></i>No PDF file';
          card.appendChild(noFile);
        }

        container.appendChild(card);
      });
    }

    function escapeAttribute(value) {
      return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function handleError(err) {
      document.getElementById('loader').innerHTML =
        `<div class="alert alert-danger m-4" role="alert">Error retrieving records: ${String(err && err.message ? err.message : err)}</div>`;
    }
