document.addEventListener('DOMContentLoaded', async () => {
    // Utility function for notifications
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Global variable for current user
    window.currentUser = null;

    let invoiceItems = [];
    let articles = [];
    let companies = [];
    let clients = [];
    let systemUsers = [];
    let currentArticleRow = null;

    // DOM Elements
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Forms
    const companyForm = document.getElementById('companyForm');
    const articleForm = document.getElementById('articleForm');
    const invoiceForm = document.getElementById('invoiceForm');
    const clientForm = document.getElementById('clientForm');

    // Buttons
    const toggleCompanyFormBtn = document.getElementById('toggleCompanyForm');
    const cancelCompanyFormBtn = document.getElementById('cancelCompanyForm');
    const toggleArticleFormBtn = document.getElementById('toggleArticleForm');
    const cancelArticleFormBtn = document.getElementById('cancelArticleForm');
    const addLineBtn = document.getElementById('addLineBtn');
    const clearFormBtn = document.getElementById('clearFormBtn');
    const toggleClientFormBtn = document.getElementById('toggleClientForm');
    const cancelClientFormBtn = document.getElementById('cancelClientForm');

    // Containers
    const companyFormContainer = document.getElementById('companyFormContainer');
    const articleFormContainer = document.getElementById('articleFormContainer');
    const invoiceItemsBody = document.getElementById('invoiceItemsBody');
    const clientFormContainer = document.getElementById('clientFormContainer');

    // Selects
    const activeCompanySelect = document.getElementById('active_company');
    const invoiceCompanySelect = document.getElementById('invoice_company');
    const filterCompanySelect = document.getElementById('filter_company');
    const clientSelector = document.getElementById('client_selector');

    // Search
    const articleSearch = document.getElementById('articleSearch');

    // Modal
    const articleModal = document.getElementById('articleModal');
    const closeArticleModal = document.getElementById('closeArticleModal');
    const modalArticleSearch = document.getElementById('modalArticleSearch');
    const articlesList = document.getElementById('articlesList');

    // Check authentication
    // Check authentication - try localStorage first, then session
    // Check authentication
    async function checkAuth() {
        try {
            const response = await fetch('/api/auth/session', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                window.currentUser = data.user;
                // Update localStorage with fresh data
                localStorage.setItem('user', JSON.stringify(window.currentUser));
                initializeUserUI();
                checkSecurityRequirements();
                return true;
            } else {
                // If session is invalid on server, clear localStorage
                localStorage.removeItem('user');
                window.currentUser = null;
                return false;
            }
        } catch (error) {
            console.error('Session check failed:', error);
            // Fallback to localStorage ONLY if network fails, but handle carefully
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                try {
                    window.currentUser = JSON.parse(storedUser);
                    initializeUserUI();
                    return true;
                } catch (e) {
                    localStorage.removeItem('user');
                }
            }
            return false;
        }
    }

    // Initialize user UI
    function initializeUserUI() {
        const userInfo = document.getElementById('userInfo');
        const userName = document.getElementById('userName');

        if (currentUser) {
            userName.textContent = `👤 ${currentUser.full_name} (${currentUser.role})`;
            userInfo.style.display = 'flex';

            // Show admin-only tabs
            if (currentUser.role === 'admin') {
                const usersTab = document.getElementById('usersTab');
                const backupsTab = document.getElementById('backupsTab');
                if (usersTab) usersTab.style.display = 'block';
                if (backupsTab) backupsTab.style.display = 'block';
            }
        }
    }

    // Initialize app after checking auth
    async function initApp() {
        const isLoggedIn = await checkAuth();
        if (!isLoggedIn) {
            window.location.href = '/login.html';
            return;
        }

        // Load data sequentially
        await Promise.all([
            loadCompanies(),
            loadArticles(),
            loadClients(),
            loadInvoices()
        ]);

        setTodayDate();
        addInvoiceLine(); // Add first line by default
    }

    // Run initialization
    initApp();

    // Tab Navigation
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
        });
    });

    // Company Management
    toggleCompanyFormBtn.addEventListener('click', () => {
        companyFormContainer.classList.toggle('hidden');
    });

    cancelCompanyFormBtn.addEventListener('click', () => {
        companyFormContainer.classList.add('hidden');
        companyForm.reset();
    });

    companyForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const editId = document.getElementById('company_id_edit').value;
        const url = editId ? `/api/companies/${editId}` : '/api/companies';
        const method = editId ? 'PUT' : 'POST';

        const formData = {
            company_name: document.getElementById('company_name').value,
            cif: document.getElementById('company_cif').value,
            address: document.getElementById('company_address').value,
            phone: document.getElementById('company_phone').value,
            email: document.getElementById('company_email').value,
            bank_iban: document.getElementById('company_bank_iban').value,
            verifactu_enabled: document.getElementById('verifactu_enabled')?.checked ? 1 : 0,
            verifactu_software_id: document.getElementById('verifactu_software_id')?.value || null,
            verifactu_certificate: window.certBase64 || null,
            verifactu_certificate_password: document.getElementById('verifactu_certificate_password')?.value || null
        };

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();
                const companyId = editId || result.id;

                // Handle logo upload if a file was selected
                if (window.logoFileToUpload) {
                    await uploadCompanyLogo(companyId, window.logoFileToUpload);
                }

                companyForm.reset();
                document.getElementById('company_id_edit').value = '';
                window.certBase64 = null;
                document.getElementById('certificate_status').textContent = '';
                companyFormContainer.classList.add('hidden');
                loadCompanies();
                showNotification('✅ Empresa guardada correctamente', 'success');

                // Reset logo preview
                if (typeof setCompanyLogo === 'function') {
                    setCompanyLogo(null, null);
                }
            } else {
                const errorData = await response.json();
                showNotification('❌ Error: ' + (errorData.error || 'Error desconocido'), 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showNotification('❌ Error de conexión', 'error');
        }
    });

    // Veri*Factu toggle handler
    const verifactuCheckbox = document.getElementById('verifactu_enabled');
    const verifactuDetails = document.getElementById('verifactu_details');

    if (verifactuCheckbox && verifactuDetails) {
        verifactuCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                verifactuDetails.classList.remove('hidden');
            } else {
                verifactuDetails.classList.add('hidden');
            }
        });
    }

    const certFileInput = document.getElementById('verifactu_certificate_file');
    const certStatus = document.getElementById('certificate_status');

    if (certFileInput) {
        certFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const binary = event.target.result;
                    window.certBase64 = btoa(
                        new Uint8Array(binary)
                            .reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );
                    if (certStatus) {
                        certStatus.textContent = '✅ Certificado seleccionado: ' + file.name;
                        certStatus.style.color = 'green';
                    }
                };
                reader.readAsArrayBuffer(file);
            }
        });
    }

    // Article Management
    toggleArticleFormBtn.addEventListener('click', () => {
        articleFormContainer.classList.toggle('hidden');
    });

    cancelArticleFormBtn.addEventListener('click', () => {
        articleFormContainer.classList.add('hidden');
        articleForm.reset();
        document.getElementById('article_id_edit').value = '';
    });

    articleForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const editId = document.getElementById('article_id_edit').value;
        const url = editId ? `/api/articles/${editId}` : '/api/articles';
        const method = editId ? 'PUT' : 'POST';

        const formData = {
            code: document.getElementById('article_code').value,
            name: document.getElementById('article_name').value,
            description: document.getElementById('article_description').value,
            unit_price: parseFloat(document.getElementById('article_price').value),
            vat_rate: parseFloat(document.getElementById('article_vat').value),
            category: document.getElementById('article_category').value
        };

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                credentials: 'include'
            });

            if (response.ok) {
                articleForm.reset();
                document.getElementById('article_id_edit').value = '';
                articleFormContainer.classList.add('hidden');
                loadArticles();
                showNotification('✅ Artículo guardado correctamente', 'success');
            } else {
                const errorData = await response.json();
                showNotification('❌ Error: ' + (errorData.error || 'Error desconocido'), 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showNotification('❌ Error de conexión', 'error');
        }
    });

    // Client Management
    if (toggleClientFormBtn) {
        toggleClientFormBtn.addEventListener('click', () => {
            clientFormContainer.classList.toggle('hidden');
        });
    }

    if (cancelClientFormBtn) {
        cancelClientFormBtn.addEventListener('click', () => {
            clientFormContainer.classList.add('hidden');
            clientForm.reset();
            document.getElementById('client_id_edit').value = '';
        });
    }

    if (clientForm) {
        clientForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const editId = document.getElementById('client_id_edit').value;
            const url = editId ? `/api/clients/${editId}` : '/api/clients';
            const method = editId ? 'PUT' : 'POST';

            const formData = {
                name: document.getElementById('client_name_mgt').value,
                cif: document.getElementById('client_cif_mgt').value,
                client_type: document.getElementById('client_type_mgt').value,
                phone: document.getElementById('client_phone_mgt').value,
                email: document.getElementById('client_email_mgt').value,
                address: document.getElementById('client_address_mgt').value
            };

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                    credentials: 'include'
                });

                if (response.ok) {
                    clientForm.reset();
                    document.getElementById('client_id_edit').value = '';
                    clientFormContainer.classList.add('hidden');
                    loadClients();
                    showNotification('✅ Cliente guardado correctamente', 'success');
                } else {
                    const errorData = await response.json();
                    showNotification('❌ Error: ' + (errorData.error || 'Error desconocido'), 'error');
                }
            } catch (error) {
                console.error('Error:', error);
                showNotification('❌ Error de conexión', 'error');
            }
        });
    }

    async function loadClients() {
        try {
            const response = await fetch('/api/clients', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                clients = data.data;
                renderClientsTable();
                updateClientSelector();
            }
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    }

    function renderClientsTable() {
        const tbody = document.querySelector('#clientsTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        clients.forEach(client => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Nombre">${client.name}</td>
                <td data-label="CIF/NIF">${client.cif}</td>
                <td data-label="Contacto">
                    <div class="client-contact">
                        ${client.phone ? `<div>📞 ${client.phone}</div>` : ''}
                        ${client.email ? `<div>📧 ${client.email}</div>` : ''}
                    </div>
                </td>
                <td data-label="Tipo"><span class="badge badge-${client.client_type}">${client.client_type}</span></td>
                <td data-label="Acciones">
                    <div class="action-buttons">
                        <button class="btn-icon btn-edit" onclick="window.editClient(${client.id})" title="Editar">✏️</button>
                        <button class="btn-icon btn-delete" onclick="window.deleteClient(${client.id})" title="Eliminar">🗑️</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateClientSelector() {
        if (!clientSelector) return;

        const currentValue = clientSelector.value;
        clientSelector.innerHTML = '<option value="">-- Manual / No guardado --</option>';

        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = `${client.name} (${client.cif})`;
            clientSelector.appendChild(option);
        });

        clientSelector.value = currentValue;
    }

    if (clientSelector) {
        clientSelector.addEventListener('change', (e) => {
            const clientId = e.target.value;
            if (!clientId) return;

            const client = clients.find(c => c.id == clientId);
            if (client) {
                document.getElementById('client_name').value = client.name;
                document.getElementById('client_cif').value = client.cif;
                document.getElementById('client_address').value = client.address;
                document.getElementById('client_type').value = client.client_type;
            }
        });
    }

    // Expose functions to window for onclick handlers
    window.editClient = function (id) {
        const client = clients.find(c => c.id == id);
        if (client) {
            document.getElementById('client_id_edit').value = client.id;
            document.getElementById('client_name_mgt').value = client.name;
            document.getElementById('client_cif_mgt').value = client.cif;
            document.getElementById('client_type_mgt').value = client.client_type;
            document.getElementById('client_phone_mgt').value = client.phone || '';
            document.getElementById('client_email_mgt').value = client.email || '';
            document.getElementById('client_address_mgt').value = client.address || '';

            clientFormContainer.classList.remove('hidden');
            clientFormContainer.scrollIntoView({ behavior: 'smooth' });
        }
    };

    window.deleteClient = async function (id) {
        if (!confirm('¿Estás seguro de que deseas eliminar este cliente?')) return;

        try {
            const response = await fetch(`/api/clients/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                loadClients();
                showNotification('✅ Cliente eliminado correctamente', 'success');
            } else {
                showNotification('❌ Error al eliminar el cliente', 'error');
            }
        } catch (error) {
            console.error('Error deleting client:', error);
            showNotification('❌ Error de conexión', 'error');
        }
    };


    articleSearch.addEventListener('input', (e) => {
        loadArticles(e.target.value);
    });

    // Invoice Items Management
    addLineBtn.addEventListener('click', () => {
        addInvoiceLine();
    });

    clearFormBtn.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres limpiar el formulario?')) {
            invoiceForm.reset();
            invoiceItems = [];
            invoiceItemsBody.innerHTML = '';
            addInvoiceLine();
            updateTotals();
            setTodayDate();
            // Trigger change to reload next invoice number
            invoiceCompanySelect.dispatchEvent(new Event('change'));
        }
    });

    // Invoice Form Submission
    // Invoice Form Handling
    let currentEditingInvoiceId = null;

    const saveDraftBtn = document.getElementById('saveDraftBtn');
    const saveProformaBtn = document.getElementById('saveProformaBtn');
    const finalizeInvoiceBtn = document.getElementById('finalizeInvoiceBtn');

    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', () => submitInvoice('draft'));
    }

    if (saveProformaBtn) {
        saveProformaBtn.addEventListener('click', () => submitInvoice('proforma'));
    }

    if (finalizeInvoiceBtn) {
        finalizeInvoiceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('¿Estás seguro de finalizar esta factura? No podrás modificarla después.')) {
                submitInvoice('final');
            }
        });
    }

    document.getElementById('clearFormBtn').addEventListener('click', clearInvoiceForm);

    const cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', clearInvoiceForm);
    }

    async function submitInvoice(status) {
        // 1. Validation: Issuer Company
        const companyId = parseInt(document.getElementById('invoice_company').value);
        if (!companyId || isNaN(companyId)) {
            showNotification('❌ Debes seleccionar una empresa emisora', 'error');
            return;
        }

        // 2. Validation: Client Data
        const clientName = document.getElementById('client_name').value.trim();
        const clientCif = document.getElementById('client_cif').value.trim();
        if (!clientName || !clientCif) {
            showNotification('❌ Debes completar los datos del cliente (Nombre y NIF/CIF)', 'error');
            return;
        }

        // 3. Validation: At least one item
        if (invoiceItems.length === 0) {
            showNotification('❌ Debes añadir al menos una línea a la factura', 'error');
            return;
        }

        // 4. Validation: Each item must have description and price
        for (let i = 0; i < invoiceItems.length; i++) {
            const item = invoiceItems[i];
            if (!item.description || !item.description.trim()) {
                showNotification(`❌ La línea ${i + 1} no tiene una descripción válida`, 'error');
                return;
            }
            if (item.unit_price <= 0) {
                showNotification(`❌ La línea ${i + 1} ("${item.description}") debe tener un precio mayor a 0`, 'error');
                return;
            }
            if (item.quantity <= 0) {
                showNotification(`❌ La línea ${i + 1} ("${item.description}") debe tener una cantidad mayor a 0`, 'error');
                return;
            }
        }

        const totals = calculateTotals();

        let formData = {
            company_id: companyId,
            client_id: document.getElementById('client_selector')?.value || null,
            invoice_number: document.getElementById('invoice_number').value,
            date: document.getElementById('date').value,
            client_name: document.getElementById('client_name').value,
            client_cif: document.getElementById('client_cif').value,
            client_address: document.getElementById('client_address').value,
            client_type: document.getElementById('client_type').value,
            notes: document.getElementById('notes').value,
            subtotal: totals.subtotal,
            total_vat: totals.totalVat,
            total: totals.total,
            items: invoiceItems,
            status: status
        };

        // Determine URL and Method
        let url = '/api/invoices';
        let method = 'POST';

        if (currentEditingInvoiceId) {
            // Update existing draft
            url = `/api/invoices/${currentEditingInvoiceId}`;
            method = 'PUT';

            // If we are finalizing an existing draft, we first update it, then call finalize endpoint?
            // Or we treat "Finalize" on update as a specific flow.
            // Simplified workflow: PUT to update draft. If status is 'final', we use the finalize endpoint.
            if (status === 'final') {
                // First save changes as draft
                try {
                    const saveResponse = await fetch(url, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...formData, status: 'draft' }), // Force draft save first
                        credentials: 'include'
                    });

                    if (!saveResponse.ok) throw new Error('Error al guardar cambios antes de finalizar');

                    // Then Finalize
                    url = `/api/invoices/${currentEditingInvoiceId}/finalize`;
                    method = 'POST';
                    // Finalize endpoint doesn't need body, relies on saved state
                    formData = {}; // Empty body as endpoint uses saved state
                } catch (err) {
                    showNotification('❌ ' + err.message, 'error');
                    return;
                }
            }
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                credentials: 'include'
            });

            if (response.ok) {
                let action = 'guardada';
                if (status === 'final') action = 'finalizada';
                if (status === 'proforma') action = 'generada como proforma';

                showNotification(`✅ Factura ${action} correctamente`, 'success');
                clearInvoiceForm();
                loadInvoices();
                // Update companies to reflect new sequence if finalized
                if (status === 'final') loadCompanies();
            } else {
                const errorData = await response.json();
                showNotification('❌ Error: ' + (errorData.error || 'Error desconocido'), 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showNotification('❌ Error de conexión', 'error');
        }
    }

    function clearInvoiceForm() {
        invoiceForm.reset();
        invoiceItems = [];
        invoiceItemsBody.innerHTML = '';
        addInvoiceLine();
        updateTotals();
        setTodayDate();
        currentEditingInvoiceId = null;

        document.getElementById('invoice_number').readOnly = false;

        // Hide cancel edit button
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) cancelBtn.classList.add('hidden');

        // Reset submit buttons text if needed
        document.getElementById('finalizeInvoiceBtn').textContent = '📝 Finalizar y Bloquear';

        // Trigger change to reload next invoice number
        const companySelect = document.getElementById('invoice_company');
        if (companySelect.value) {
            companySelect.dispatchEvent(new Event('change'));
        }
    }

    // Expose edit function globally
    // Expose edit function globally
    window.editInvoice = async function (id) {
        try {
            const response = await fetch(`/api/invoices/${id}`, { credentials: 'include' });
            const result = await response.json();

            if (result.message === 'success' && result.data) {
                const invoice = result.data.invoice;
                const items = result.data.items;

                currentEditingInvoiceId = id;

                // Populate Form
                document.getElementById('invoice_company').value = invoice.company_id || '';
                document.getElementById('invoice_number').value = invoice.invoice_number || '';
                document.getElementById('date').value = invoice.date || '';
                document.getElementById('client_type').value = invoice.client_type || 'particular';
                document.getElementById('client_name').value = invoice.client_name || '';
                document.getElementById('client_cif').value = invoice.client_cif || '';
                document.getElementById('client_address').value = invoice.client_address || '';
                document.getElementById('notes').value = invoice.notes || '';

                if (invoice.client_id) {
                    const clientSelector = document.getElementById('client_selector');
                    if (clientSelector) clientSelector.value = invoice.client_id;
                }

                // Populate Items
                if (items && Array.isArray(items)) {
                    invoiceItems = items.map(item => ({
                        article_id: item.article_id,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        vat_rate: item.vat_rate,
                        line_total: item.line_total,
                        line_vat: item.line_vat,
                        line_total_with_vat: item.line_total_with_vat
                    }));
                } else {
                    invoiceItems = [];
                }

                renderInvoiceItems();
                updateTotals();

                // Show Cancel Edit button
                const cancelBtn = document.getElementById('cancelEditBtn');
                if (cancelBtn) cancelBtn.classList.remove('hidden');

                // Update final button text
                const finalizeBtn = document.getElementById('finalizeInvoiceBtn');
                if (finalizeBtn) finalizeBtn.textContent = '📝 Finalizar Borrador';

                // Scroll to form
                const formSection = document.querySelector('.form-section');
                if (formSection) formSection.scrollIntoView({ behavior: 'smooth' });

                showNotification('✏️ Factura cargada para edición', 'info');
            } else {
                showNotification('❌ Error: Formato de respuesta inválido', 'error');
            }
        } catch (error) {
            console.error('Error loading invoice:', error);
            showNotification('❌ Error al cargar factura', 'error');
        }
    };

    async function loadInvoiceItemsForEdit(invoiceId) {
        // This requires an endpoint I might need to create.
        // Or I can use the trick: Add GET /api/invoices/:id to return items.
        // I will do that in next step.
    }

    // Filter invoices
    filterCompanySelect.addEventListener('change', () => {
        loadInvoices();
    });

    // Modal Management

    // Export and Print
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const printListBtn = document.getElementById('printListBtn');

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            // Basic implementation: Export what is currently filtered (by fetching again with filters or just using current data?)
            // Better: construct query params from filters and hit an export endpoint.
            // OR: Client-side export of current table.
            // Let's do client side for simplicity mostly, but backend is better for large datasets.
            // Implementation Plan said: Backend GET /api/reports/invoices/export
            // So let's build the query string and open that URL.
            const queryParams = new URLSearchParams({
                company_id: filterCompanySelect.value,
                date_from: document.getElementById('filter_date_from').value,
                date_to: document.getElementById('filter_date_to').value,
                client: document.getElementById('filter_client').value,
                invoice_number: document.getElementById('filter_invoice_number').value,
                client_type: document.getElementById('filter_client_type').value,
                verifactu: document.getElementById('filter_verifactu').value,
                status: document.getElementById('filter_status').value,
                format: 'csv'
            }).toString();

            window.location.href = `/api/reports/invoices/export?${queryParams}`;
        });
    }

    if (printListBtn) {
        printListBtn.addEventListener('click', () => {
            const queryParams = new URLSearchParams({
                company_id: filterCompanySelect.value,
                date_from: document.getElementById('filter_date_from').value,
                date_to: document.getElementById('filter_date_to').value,
                client: document.getElementById('filter_client').value,
                invoice_number: document.getElementById('filter_invoice_number').value,
                client_type: document.getElementById('filter_client_type').value,
                verifactu: document.getElementById('filter_verifactu').value,
                status: document.getElementById('filter_status').value,
                print: 'true'
            }).toString();

            // Open in new window
            window.open(`/api/reports/invoices/print?${queryParams}`, '_blank');
        });
    }

    closeArticleModal.addEventListener('click', () => {
        articleModal.classList.add('hidden');
    });

    articleModal.addEventListener('click', (e) => {
        if (e.target === articleModal) {
            articleModal.classList.add('hidden');
        }
    });

    modalArticleSearch.addEventListener('input', (e) => {
        renderArticlesList(e.target.value);
    });

    // Functions
    function addInvoiceLine(article = null) {
        const index = invoiceItems.length;
        const item = {
            article_id: article?.id || null,
            description: article?.name || '',
            quantity: 1,
            unit_price: article?.unit_price || 0,
            vat_rate: article?.vat_rate || 21,
            line_total: 0,
            line_vat: 0,
            line_total_with_vat: 0
        };

        invoiceItems.push(item);
        renderInvoiceItems();
        updateTotals();
    }

    function renderInvoiceItems() {
        invoiceItemsBody.innerHTML = '';

        invoiceItems.forEach((item, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <button type="button" class="article-selector-btn" data-index="${index}">
                        ${item.description || '🔍 Seleccionar...'}
                    </button>
                </td>
                <td>
                    <input type="text" class="item-description" data-index="${index}" 
                           value="${item.description}" placeholder="Descripción">
                </td>
                <td>
                    <input type="number" class="item-quantity" data-index="${index}" 
                           value="${item.quantity}" min="0.01" step="0.01">
                </td>
                <td>
                    <input type="number" class="item-price" data-index="${index}" 
                           value="${item.unit_price}" min="0" step="0.01">
                </td>
                <td>
                    <select class="item-vat" data-index="${index}">
                        <option value="21" ${item.vat_rate === 21 ? 'selected' : ''}>21%</option>
                        <option value="10" ${item.vat_rate === 10 ? 'selected' : ''}>10%</option>
                        <option value="4" ${item.vat_rate === 4 ? 'selected' : ''}>4%</option>
                        <option value="0" ${item.vat_rate === 0 ? 'selected' : ''}>0%</option>
                    </select>
                </td>
                <td style="text-align: right; font-weight: 600;">
                    ${formatCurrency(item.line_total)}
                </td>
                <td>
                    <button type="button" class="btn-remove-line" data-index="${index}">🗑️</button>
                </td>
            `;

            invoiceItemsBody.appendChild(row);
        });

        attachItemEventListeners();
    }

    function attachItemEventListeners() {
        // Article selector buttons
        document.querySelectorAll('.article-selector-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                currentArticleRow = index;
                showArticleModal();
            });
        });

        // Description inputs
        document.querySelectorAll('.item-description').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                invoiceItems[index].description = e.target.value;
            });
        });

        // Quantity inputs
        document.querySelectorAll('.item-quantity').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                invoiceItems[index].quantity = parseFloat(e.target.value) || 0;
                updateLineTotal(index);
            });
        });

        // Price inputs
        document.querySelectorAll('.item-price').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                invoiceItems[index].unit_price = parseFloat(e.target.value) || 0;
                updateLineTotal(index);
            });
        });

        // VAT selects
        document.querySelectorAll('.item-vat').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                invoiceItems[index].vat_rate = parseFloat(e.target.value);
                updateLineTotal(index);
            });
        });

        // Remove buttons
        document.querySelectorAll('.btn-remove-line').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                invoiceItems.splice(index, 1);
                renderInvoiceItems();
                updateTotals();
            });
        });
    }

    function updateLineTotal(index) {
        const item = invoiceItems[index];
        item.line_total = item.quantity * item.unit_price;
        item.line_vat = item.line_total * (item.vat_rate / 100);
        item.line_total_with_vat = item.line_total + item.line_vat;

        // Update only the line total cell without re-rendering the entire table
        const rows = invoiceItemsBody.querySelectorAll('tr');
        if (rows[index]) {
            const totalCell = rows[index].querySelector('td:nth-child(6)');
            if (totalCell) {
                totalCell.textContent = formatCurrency(item.line_total);
            }
        }

        updateTotals();
    }

    function calculateTotals() {
        let subtotal = 0;
        let totalVat = 0;

        invoiceItems.forEach(item => {
            subtotal += item.line_total;
            totalVat += item.line_vat;
        });

        return {
            subtotal: subtotal,
            totalVat: totalVat,
            total: subtotal + totalVat
        };
    }

    function updateTotals() {
        const totals = calculateTotals();

        document.getElementById('subtotalDisplay').textContent = formatCurrency(totals.subtotal);
        document.getElementById('vatTotalDisplay').textContent = formatCurrency(totals.totalVat);
        document.getElementById('totalDisplay').textContent = formatCurrency(totals.total);
    }

    function showArticleModal() {
        renderArticlesList();
        articleModal.classList.remove('hidden');
        modalArticleSearch.value = '';
        modalArticleSearch.focus();
    }

    function renderArticlesList(searchTerm = '') {
        const filtered = articles.filter(article => {
            const search = searchTerm.toLowerCase();
            return article.name.toLowerCase().includes(search) ||
                (article.code && article.code.toLowerCase().includes(search)) ||
                (article.description && article.description.toLowerCase().includes(search));
        });

        articlesList.innerHTML = '';

        if (filtered.length === 0) {
            articlesList.innerHTML = '<p style="text-align: center; color: #64748b;">No se encontraron artículos</p>';
            return;
        }

        filtered.forEach(article => {
            const div = document.createElement('div');
            div.className = 'article-item';
            div.innerHTML = `
                <div class="article-item-name">${article.name}</div>
                <div class="article-item-details">
                    ${article.code ? `Código: ${article.code} | ` : ''}
                    Precio: ${formatCurrency(article.unit_price)} | 
                    IVA: ${article.vat_rate}%
                    ${article.category ? ` | ${article.category}` : ''}
                </div>
            `;

            div.addEventListener('click', () => {
                selectArticle(article);
            });

            articlesList.appendChild(div);
        });
    }

    function selectArticle(article) {
        if (currentArticleRow !== null) {
            const index = currentArticleRow;
            invoiceItems[index] = {
                article_id: article.id,
                description: article.name + (article.description ? ' - ' + article.description : ''),
                quantity: invoiceItems[index].quantity || 1,
                unit_price: article.unit_price,
                vat_rate: article.vat_rate,
                line_total: 0,
                line_vat: 0,
                line_total_with_vat: 0
            };

            // Update DOM directly for the current row to show new values immediately
            const rows = invoiceItemsBody.querySelectorAll('tr');
            if (rows[index]) {
                const btn = rows[index].querySelector('.article-selector-btn');
                const descInput = rows[index].querySelector('.item-description');
                const priceInput = rows[index].querySelector('.item-price');
                const vatSelect = rows[index].querySelector('.item-vat');

                if (btn) btn.textContent = article.name;
                if (descInput) descInput.value = invoiceItems[index].description;
                if (priceInput) priceInput.value = article.unit_price;
                if (vatSelect) vatSelect.value = article.vat_rate;
            }

            updateLineTotal(index);
        }

        articleModal.classList.add('hidden');
        currentArticleRow = null;
    }

    async function loadCompanies() {
        // Make available globally for logo-management.js
        window.loadCompanies = loadCompanies;
        try {
            const response = await fetch('/api/companies', { credentials: 'include' });
            const result = await response.json();

            if (result.message === 'success') {
                companies = result.data;
                populateCompanySelects(result.data);
                renderCompaniesTable(result.data);
            }
        } catch (error) {
            console.error('Error loading companies:', error);
        }
    }

    function renderCompaniesTable(companiesList) {
        const tbody = document.querySelector('#companiesTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        companiesList.forEach(company => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Empresa"><strong>${company.company_name}</strong></td>
                <td data-label="CIF">${company.cif}</td>
                <td data-label="Contacto">
                    ${company.phone || ''}<br>
                    <small>${company.email || ''}</small>
                </td>
                <td data-label="Veri*Factu">${company.verifactu_enabled ? '✅ Habilitado' : '❌ Desactivado'}</td>
                <td data-label="Acciones">
                    <div class="btn-actions">
                        <button class="btn-preview" onclick="editCompany(${company.id})">✏️ Editar</button>
                        <button class="btn-danger" onclick="deleteCompany(${company.id})">🗑️</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    window.editCompany = function (id) {
        const company = companies.find(c => c.id === id);
        if (!company) return;

        document.getElementById('company_id_edit').value = company.id;
        document.getElementById('company_name').value = company.company_name;
        document.getElementById('company_cif').value = company.cif;
        document.getElementById('company_address').value = company.address || '';
        document.getElementById('company_phone').value = company.phone || '';
        document.getElementById('company_email').value = company.email || '';
        document.getElementById('company_bank_iban').value = company.bank_iban || '';

        const verifactuEnabled = company.verifactu_enabled === 1;
        const verifactuCheckbox = document.getElementById('verifactu_enabled');
        if (verifactuCheckbox) {
            verifactuCheckbox.checked = verifactuEnabled;
            verifactuCheckbox.dispatchEvent(new Event('change'));
        }

        document.getElementById('verifactu_software_id').value = company.verifactu_software_id || '';
        document.getElementById('verifactu_certificate_password').value = company.verifactu_certificate_password || '';

        window.certBase64 = company.verifactu_certificate || null;
        const certStatus = document.getElementById('certificate_status');
        if (certStatus) {
            certStatus.textContent = company.verifactu_certificate ? '✅ Certificado cargado' : '';
            certStatus.style.color = 'green';
        }

        // Handle logo
        if (typeof setCompanyLogo === 'function') {
            setCompanyLogo(company.id, company.logo);
        }

        companyFormContainer.classList.remove('hidden');
        companyFormContainer.scrollIntoView({ behavior: 'smooth' });
    };

    window.deleteCompany = async function (id) {
        if (!confirm('¿Estás seguro de que quieres eliminar esta empresa? Se eliminarán todos sus datos.')) {
            return;
        }

        try {
            const response = await fetch(`/api/companies/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                loadCompanies();
                showNotification('✅ Empresa eliminada correctamente', 'success');
            } else {
                const errorData = await response.json();
                showNotification('❌ Error: ' + (errorData.error || 'Error al eliminar'), 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showNotification('❌ Error de conexión', 'error');
        }
    };

    function populateCompanySelects(companies) {
        activeCompanySelect.innerHTML = '<option value="">Seleccionar empresa...</option>';
        invoiceCompanySelect.innerHTML = '<option value="">Seleccionar empresa...</option>';
        filterCompanySelect.innerHTML = '<option value="">Todas las empresas</option>';

        companies.forEach(company => {
            const option1 = new Option(company.company_name, company.id);
            const option2 = new Option(company.company_name, company.id);
            const option3 = new Option(company.company_name, company.id);

            activeCompanySelect.add(option1);
            invoiceCompanySelect.add(option2);
            filterCompanySelect.add(option3);
        });

        if (companies.length > 0 && !activeCompanySelect.value) {
            activeCompanySelect.value = companies[0].id;
            invoiceCompanySelect.value = companies[0].id;
            // Trigger change to load first company's next invoice number
            invoiceCompanySelect.dispatchEvent(new Event('change'));
        }
    }

    // Handle company change in invoice form to suggest next invoice number
    invoiceCompanySelect.addEventListener('change', async () => {
        const companyId = invoiceCompanySelect.value;
        if (!companyId) return;

        try {
            const response = await fetch(`/api/companies/${companyId}/next-invoice-number`, {
                credentials: 'include'
            });
            const result = await response.json();

            if (response.ok) {
                document.getElementById('invoice_number').value = result.next_invoice_number;
            }
        } catch (error) {
            console.error('Error fetching next invoice number:', error);
        }
    });

    async function loadArticles(searchTerm = '') {
        try {
            let url = '/api/articles';
            if (searchTerm) {
                url += `?search=${encodeURIComponent(searchTerm)}`;
            }

            const response = await fetch(url, { credentials: 'include' });
            const result = await response.json();

            if (result.message === 'success') {
                articles = result.data;
                renderArticlesTable(result.data);
            }
        } catch (error) {
            console.error('Error loading articles:', error);
        }
    }

    function renderArticlesTable(articles) {
        const tbody = document.querySelector('#articlesTable tbody');
        tbody.innerHTML = '';

        articles.forEach(article => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Código">${article.code || '-'}</td>
                <td data-label="Nombre">${article.name}</td>
                <td data-label="Descripción">${article.description || '-'}</td>
                <td data-label="Precio">${formatCurrency(article.unit_price)}</td>
                <td data-label="IVA">${article.vat_rate}%</td>
                <td data-label="Categoría">${article.category || '-'}</td>
                <td data-label="Acciones">
                    <div class="action-buttons">
                        <button class="btn-icon btn-edit" onclick="window.editArticle(${article.id})" title="Editar">✏️</button>
                        <button class="btn-icon btn-delete" onclick="window.deleteArticle(${article.id})" title="Eliminar">🗑️</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    window.editArticle = function (id) {
        const article = articles.find(a => a.id === id);
        if (article) {
            document.getElementById('article_id_edit').value = article.id;
            document.getElementById('article_code').value = article.code || '';
            document.getElementById('article_name').value = article.name;
            document.getElementById('article_description').value = article.description || '';
            document.getElementById('article_price').value = article.unit_price;
            document.getElementById('article_vat').value = article.vat_rate;
            document.getElementById('article_category').value = article.category || '';

            articleFormContainer.classList.remove('hidden');
            articleFormContainer.scrollIntoView({ behavior: 'smooth' });
        }
    };

    window.deleteArticle = async function (id) {
        if (!confirm('¿Estás seguro de que quieres eliminar este artículo?')) {
            return;
        }

        try {
            const response = await fetch(`/api/articles/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                loadArticles();
                showNotification('✅ Artículo eliminado correctamente', 'success');
            } else {
                showNotification('❌ Error al eliminar el artículo', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showNotification('❌ Error de conexión', 'error');
        }
    };

    async function loadInvoices() {
        try {
            const filters = {
                company_id: document.getElementById('filter_company').value,
                date_from: document.getElementById('filter_date_from').value,
                date_to: document.getElementById('filter_date_to').value,
                client: document.getElementById('filter_client').value,
                invoice_number: document.getElementById('filter_invoice_number').value,
                client_type: document.getElementById('filter_client_type').value,
                verifactu: document.getElementById('filter_verifactu').value,
                status: document.getElementById('filter_status').value
            };

            // Build query string
            const params = new URLSearchParams();
            Object.keys(filters).forEach(key => {
                if (filters[key]) {
                    params.append(key, filters[key]);
                }
            });

            const url = `/api/invoices${params.toString() ? '?' + params.toString() : ''}`;
            const response = await fetch(url, { credentials: 'include' });
            const result = await response.json();

            if (result.message === 'success') {
                renderInvoicesTable(result.data);
            }
        } catch (error) {
            console.error('Error loading invoices:', error);
        }
    }

    function renderInvoicesTable(invoices) {
        const tbody = document.querySelector('#invoicesTable tbody');
        tbody.innerHTML = '';

        invoices.forEach(invoice => {
            const row = document.createElement('tr');
            const clientTypeBadge = `<span class="badge badge-${invoice.client_type}">${invoice.client_type}</span>`;

            // Add Veri*Factu badge if applicable
            let verifactuBadge = '';
            if (invoice.current_hash) {
                verifactuBadge = '<span class="badge-verifactu">✓ Veri*Factu</span>';
            }

            // Add cancelled badge if applicable
            // Determine Status Badge
            let statusBadge = '';
            if (invoice.is_cancelled) {
                statusBadge = '<span class="badge badge-cancelled">⚠️ Anulada</span>';
            } else if (invoice.status === 'final') {
                statusBadge = '<span class="badge badge-final">🔒 Finalizada</span>';
            } else if (invoice.status === 'proforma') {
                statusBadge = '<span class="badge badge-proforma">📄 Proforma</span>';
            } else {
                statusBadge = '<span class="badge badge-draft">📝 Borrador</span>';
            }

            row.innerHTML = `
                <td data-label="Empresa">${invoice.company_name || 'N/A'}</td>
                <td data-label="Nº Factura">${invoice.invoice_number}${verifactuBadge}</td>
                <td data-label="Fecha">${formatDate(invoice.date)}</td>
                <td data-label="Cliente">${invoice.client_name}</td>
                <td data-label="Estado">${statusBadge}</td>
                <td data-label="Tipo">${clientTypeBadge}</td>
                <td data-label="Total" style="font-weight: 600;">${formatCurrency(invoice.total)}</td>
                <td data-label="Acciones">
                    <div class="btn-actions">
                        ${invoice.status !== 'final' && !invoice.is_cancelled ?
                    `<button class="btn-secondary" onclick="editInvoice(${invoice.id})">✏️ Editar</button>` : ''}
                        
                        <button class="btn-preview" onclick="previewPDF(${invoice.id}, '${invoice.invoice_number}')">
                            👁️
                        </button>
                        <button class="btn-pdf" onclick="downloadPDF(${invoice.id}, '${invoice.invoice_number}')">
                            📄
                        </button>
                        ${invoice.status !== 'final' ?
                    `<button class="btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="window.deleteInvoice(${invoice.id})" title="Ocultar/Eliminar">🗑️</button>` : ''}
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    window.downloadPDF = async function (invoiceId, invoiceNumber) {
        // Direct link is better for insecure contexts (HTTP) to avoid blob URL warnings
        // And it simplifies the download process while preserving authentication
        const downloadUrl = `/api/invoices/${invoiceId}/pdf?download=true`;
        window.location.href = downloadUrl;
        showNotification('⏳ Iniciando descarga de PDF...', 'info');
    };

    window.deleteInvoice = async function (id) {
        if (!confirm('¿Estás seguro de que deseas ocultar/eliminar esta factura? (Se mantendrá en el sistema pero no se verá en la lista)')) return;

        try {
            const response = await fetch(`/api/invoices/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                loadInvoices();
                showNotification('✅ Factura ocultada correctamente', 'success');
            } else {
                const errorData = await response.json();
                showNotification('❌ Error: ' + (errorData.error || 'No se pudo ocultar la factura'), 'error');
            }
        } catch (error) {
            console.error('Error deleting invoice:', error);
            showNotification('❌ Error de conexión', 'error');
        }
    };

    window.previewPDF = function (invoiceId, invoiceNumber) {
        const modal = document.getElementById('pdfModal');
        const iframe = document.getElementById('pdfViewer');
        const title = document.getElementById('pdfModalTitle');

        // Set title
        title.textContent = `Vista Previa - Factura ${invoiceNumber}`;

        // Load PDF in iframe
        iframe.src = `/api/invoices/${invoiceId}/pdf`;

        // Store invoice ID for download button
        modal.dataset.invoiceId = invoiceId;
        modal.dataset.invoiceNumber = invoiceNumber;

        // Show modal
        modal.classList.remove('hidden');
    };

    function formatCurrency(amount) {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount || 0);
    }

    function formatDate(dateString) {
        const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        return new Date(dateString).toLocaleDateString('es-ES', options);
    }

    function setTodayDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date').value = today;
    }

    window.showNotification = function (message, type = 'info') {
        // Simple alert for now - could be enhanced with a toast notification
        alert(message);
    };

    // PDF Modal Event Listeners
    document.getElementById('closePdfModal').addEventListener('click', closePdfModal);
    document.getElementById('closePdfModalBtn').addEventListener('click', closePdfModal);
    document.getElementById('downloadFromModal').addEventListener('click', () => {
        const modal = document.getElementById('pdfModal');
        const invoiceId = modal.dataset.invoiceId;
        const invoiceNumber = modal.dataset.invoiceNumber;
        downloadPDF(invoiceId, invoiceNumber);
    });

    function closePdfModal() {
        const modal = document.getElementById('pdfModal');
        const iframe = document.getElementById('pdfViewer');
        if (iframe) iframe.src = 'about:blank';
        if (modal) modal.classList.add('hidden');
    }

    // Filter Event Listeners
    const filterInputs = [
        'filter_company',
        'filter_date_from',
        'filter_date_to',
        'filter_client',
        'filter_invoice_number',
        'filter_client_type',
        'filter_verifactu',
        'filter_status'
    ];

    filterInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            if (element.tagName === 'SELECT' || element.type === 'date') {
                element.addEventListener('change', loadInvoices);
            } else if (element.type === 'text') {
                element.addEventListener('input', debounce(loadInvoices, 500));
            }
        }
    });

    document.getElementById('clearFilters').addEventListener('click', () => {
        filterInputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.value = '';
            }
        });
        loadInvoices();
    });

    // Debounce helper function
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================================
    // USER MANAGEMENT (Admin only)
    // ============================================

    // DOM Elements for Users
    const toggleUserFormBtn = document.getElementById('toggleUserForm');
    const cancelUserFormBtn = document.getElementById('cancelUserForm');
    const userFormContainer = document.getElementById('userFormContainer');
    const userForm = document.getElementById('userForm');
    const usersTableBody = document.getElementById('usersTableBody');

    // Event Listeners for Users
    if (toggleUserFormBtn) {
        toggleUserFormBtn.addEventListener('click', () => {
            if (userFormContainer) userFormContainer.classList.toggle('hidden');
        });
    }

    if (cancelUserFormBtn) {
        cancelUserFormBtn.addEventListener('click', () => {
            if (userFormContainer) userFormContainer.classList.add('hidden');
            if (userForm) userForm.reset();
            document.getElementById('user_id_edit').value = '';
            document.getElementById('user_password').required = true;
        });
    }

    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createUser();
        });
    }

    // Load Users
    async function loadUsers() {
        try {
            const response = await fetch('/api/users', { credentials: 'include' });
            const result = await response.json();

            if (result.message === 'success') {
                systemUsers = result.data;
                renderUsersTable(result.data);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    // Render Users Table
    function renderUsersTable(users) {
        if (!usersTableBody) return;
        usersTableBody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');

            const roleClass = `badge-${user.role}`;
            const statusClass = user.is_active ? 'badge-active' : 'badge-inactive';
            const statusText = user.is_active ? 'Activo' : 'Inactivo';

            const lastLogin = user.last_login
                ? new Date(user.last_login).toLocaleString('es-ES')
                : 'Nunca';

            // Check if user is protected (admin or root)
            const isProtected = user.username === 'admin' || user.username === 'root';

            row.innerHTML = `
                <td>${user.username}${isProtected ? ' 🔒' : ''}</td>
                <td>${user.full_name}</td>
                <td>${user.email || '-'}</td>
                <td><span class="badge-role ${roleClass}">${user.role}</span></td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>${lastLogin}</td>
                <td>
                    ${isProtected
                    ? '<span class="text-muted" title="Usuario protegido del sistema">🔒 Protegido</span>'
                    : `
                        <div class="action-buttons">
                            <button class="btn-icon btn-edit" onclick="window.editUser(${user.id})" title="Editar">✏️</button>
                            <button class="btn-icon btn-delete" data-id="${user.id}" data-username="${user.username}">Desactivar</button>
                        </div>
                    `}
                </td>
            `;

            const deleteBtn = row.querySelector('.btn-delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => deleteUser(user.id, user.username));
            }

            usersTableBody.appendChild(row);
        });
    }

    // Create User
    async function createUser() {
        const editId = document.getElementById('user_id_edit').value;
        const url = editId ? `/api/users/${editId}` : '/api/users';
        const method = editId ? 'PUT' : 'POST';

        const usernameInput = document.getElementById('user_username');
        const passwordInput = document.getElementById('user_password');
        const fullNameInput = document.getElementById('user_full_name');
        const emailInput = document.getElementById('user_email');
        const roleInput = document.getElementById('user_role');

        const userData = {
            username: usernameInput.value,
            full_name: fullNameInput.value,
            email: emailInput.value,
            role: roleInput.value
        };

        // Only include password if creating OR if a new password was provided during edit
        if (!editId || passwordInput.value) {
            userData.password = passwordInput.value;
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData),
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok) {
                showNotification(`✅ Usuario ${editId ? 'actualizado' : 'creado'} exitosamente`, 'success');
                if (userForm) userForm.reset();
                if (userFormContainer) userFormContainer.classList.add('hidden');
                document.getElementById('user_id_edit').value = '';
                // Make password required again in case it was optional during edit
                passwordInput.required = true;
                loadUsers();
            } else {
                showNotification('❌ ' + (result.error || 'Error al guardar usuario'), 'error');
            }
        } catch (error) {
            console.error('Error saving user:', error);
            showNotification('❌ Error de conexión al guardar usuario', 'error');
        }
    }

    window.editUser = function (id) {
        const user = systemUsers.find(u => u.id === id);
        if (user) {
            document.getElementById('user_id_edit').value = user.id;
            document.getElementById('user_username').value = user.username;
            document.getElementById('user_full_name').value = user.full_name;
            document.getElementById('user_email').value = user.email || '';
            document.getElementById('user_role').value = user.role;

            // Password is not required when editing
            document.getElementById('user_password').required = false;
            document.getElementById('user_password').value = '';

            userFormContainer.classList.remove('hidden');
            userFormContainer.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // Delete User
    async function deleteUser(userId, username) {
        // Use customConfirm instead of native confirm
        const confirmed = await window.customConfirm(`¿Estás seguro de desactivar al usuario "${username}"?`);
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/users/${userId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok) {
                showNotification('✅ Usuario desactivado exitosamente', 'success');
                loadUsers();
            } else {
                showNotification('❌ ' + (result.error || 'Error al desactivar usuario'), 'error');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('❌ Error de conexión al desactivar usuario', 'error');
        }
    }

    // Combined load logic for Users tab
    const usersTab = document.querySelector('[data-tab="users"]');
    if (usersTab) {
        usersTab.addEventListener('click', () => {
            if (window.currentUser && window.currentUser.role === 'admin') {
                loadUsers();
            }
        });
    }

    // Security Requirements Check
    function checkSecurityRequirements() {
        const securityBanner = document.getElementById('securityBanner');
        const closeSecurityBanner = document.getElementById('closeSecurityBanner');

        if (!currentUser || !securityBanner) return;

        // Show banner if must_change_password is true
        if (currentUser.must_change_password === 1) {
            securityBanner.classList.remove('hidden');

            if (closeSecurityBanner) {
                closeSecurityBanner.addEventListener('click', () => {
                    securityBanner.classList.add('hidden');
                    // Notify risk if ignored
                    showNotification('⚠️ Atención: Mantener la contraseña por defecto es un riesgo crítico de seguridad.', 'error');
                });
            }
        }
    }
});

// Logout (Defined outside to ensure it's available even if DOMContentLoaded has issues)
window.logout = async function () {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            // Clear localStorage
            localStorage.removeItem('user');
            window.currentUser = null;
            // Redirect to login
            window.location.href = '/login.html';
        } else {
            // If showNotification is not available yet, fall back to alert
            if (typeof showNotification === 'function') {
                showNotification('❌ Error al cerrar sesión', 'error');
            } else {
                alert('Error al cerrar sesión');
            }
        }
    } catch (error) {
        console.error('Logout error:', error);
        if (typeof showNotification === 'function') {
            showNotification('❌ Error de conexión al cerrar sesión', 'error');
        } else {
            alert('Error de conexión al cerrar sesión');
        }
    }
};
