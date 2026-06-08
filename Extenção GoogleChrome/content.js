function realizarLoginAutomatico() {
  setTimeout(() => {
    const botaoEntrar = document.querySelector('button[type="submit"]') || 
                        document.querySelector('.btn-login') || 
                        document.querySelector('form button');

    if (botaoEntrar) {
      console.log("Michelin Seguros: Credenciais detectadas. Realizando login automático...");
      botaoEntrar.click();
    } else {
      console.log("Michelin Seguros: Botão de login não encontrado.");
    }
  }, 1000); 
}

realizarLoginAutomatico();