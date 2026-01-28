// ============================================
// COMPANY LOGO MANAGEMENT
// ============================================

// Logo preview and upload handling
const companyLogoInput = document.getElementById('company_logo');
const logoPreview = document.getElementById('logo_preview');
const logoPreviewImg = document.getElementById('logo_preview_img');
const removeLogoBtn = document.getElementById('remove_logo_btn');

window.currentCompanyId = null;
window.logoFileToUpload = null;

if (companyLogoInput) {
    companyLogoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                alert('Por favor selecciona un archivo de imagen');
                companyLogoInput.value = '';
                return;
            }

            // Validate file size (2MB max)
            if (file.size > 2 * 1024 * 1024) {
                alert('El archivo es demasiado grande. Máximo 2MB');
                companyLogoInput.value = '';
                return;
            }

            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                logoPreviewImg.src = e.target.result;
                logoPreview.style.display = 'block';
            };
            reader.readAsDataURL(file);

            window.logoFileToUpload = file;
        }
    });
}

if (removeLogoBtn) {
    removeLogoBtn.addEventListener('click', async () => {
        if (window.currentCompanyId) {
            // Delete logo from server
            if (confirm('¿Estás seguro de eliminar el logo?')) {
                await deleteCompanyLogo(window.currentCompanyId);
            }
        } else {
            // Just clear the preview
            logoPreviewImg.src = '';
            logoPreview.style.display = 'none';
            companyLogoInput.value = '';
            window.logoFileToUpload = null;
        }
    });
}

async function uploadCompanyLogo(companyId, file) {
    const formData = new FormData();
    formData.append('logo', file);

    try {
        const response = await fetch(`/api/companies/${companyId}/logo`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            console.log('Logo subido exitosamente');
            return result.logo;
        } else {
            throw new Error(result.error || 'Error al subir logo');
        }
    } catch (error) {
        console.error('Error uploading logo:', error);
        alert('Error al subir el logo: ' + error.message);
        return null;
    }
}

async function deleteCompanyLogo(companyId) {
    try {
        const response = await fetch(`/api/companies/${companyId}/logo`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            logoPreviewImg.src = '';
            logoPreview.style.display = 'none';
            companyLogoInput.value = '';
            window.logoFileToUpload = null;
            window.currentCompanyId = null;
            alert('Logo eliminado exitosamente');
            if (typeof window.loadCompanies === 'function') {
                window.loadCompanies(); // Reload companies list
            }
        } else {
            alert(result.error || 'Error al eliminar logo');
        }
    } catch (error) {
        console.error('Error deleting logo:', error);
        alert('Error al eliminar el logo');
    }
}

function setCompanyLogo(companyId, logoPath) {
    window.currentCompanyId = companyId;
    if (logoPath) {
        logoPreviewImg.src = logoPath;
        logoPreview.style.display = 'block';
    } else {
        logoPreviewImg.src = '';
        logoPreview.style.display = 'none';
    }
    companyLogoInput.value = '';
    window.logoFileToUpload = null;
}
