import { expect, loginAs, test } from '../fixtures';

test.describe('Acceso y roles', () => {
  test('credenciales incorrectas muestran un error y no entran', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo').fill('operador@simu.local');
    await page.getByLabel('Contraseña').fill('incorrecta');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('ciudadanía no ve las vistas de personal y no puede abrirlas por URL', async ({ page }) => {
    await loginAs(page, 'ciudadano');
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Mapa' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Reglas' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Dispositivos' })).toHaveCount(0);

    await page.goto('/reglas');
    await expect(page).not.toHaveURL(/\/reglas$/);
  });

  test('la sesión sobrevive a recargar la página', async ({ page }) => {
    await loginAs(page, 'operador');
    await page.reload();
    await expect(page.getByText('Operación Demo')).toBeVisible();
    await expect(page).toHaveTitle('ViaLia · CDMX');
  });
});
