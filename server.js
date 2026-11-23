
// Importando o Express
const express = require('express');

// Importando HTTP
const http = require('http');

// Importando Socket.io
const { Server } = require('socket.io');

// Criando aplicação
const app = express();

// Criando servidor HTTP
const servidor = http.createServer(app);

// Configurando Socket.io
const io = new Server(servidor, {
    maxHttpBufferSize: 4e6
});

// Disponibilizando os arquivos
app.use(express.static(__dirname));

// Página inicial
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Usuários conectados
const usuarios = new Map();

// Histórico do chat geral
const historicoGeral = [];

// Histórico das conversas privadas
const conversasPrivadas = new Map();

// Criando chave para conversas privadas
function chaveConversa(id1, id2) {
    return [id1, id2].sort().join('_');
}

// Atualizar lista de funcionários online
function atualizarUsuarios() {
    const lista = Array.from(usuarios.entries()).map(([id, usuario]) => ({
        id: id,
        nome: usuario.nome,
        foto: usuario.foto
    }));

    io.emit('users list', lista);
}

// Validar imagens
function validarImagem(imagem) {
    if (!imagem) return true;

    return typeof imagem === 'string' &&
        imagem.startsWith('data:image/') &&
        imagem.length <= 3000000;
}

// Criar e salvar mensagem
function salvarMensagem(dados, privada = false) {
    const mensagem = {
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        de: dados.de,
        para: dados.para || null,
        nome: dados.nome,
        foto: dados.foto || '',
        texto: dados.texto || '',
        imagem: dados.imagem || null,
        data: new Date().toISOString()
    };

    if (privada) {
        const chave = chaveConversa(dados.de, dados.para);

        if (!conversasPrivadas.has(chave)) {
            conversasPrivadas.set(chave, []);
        }

        const historico = conversasPrivadas.get(chave);

        historico.push(mensagem);

        if (historico.length > 200) {
            historico.shift();
        }

    } else {
        historicoGeral.push(mensagem);

        if (historicoGeral.length > 200) {
            historicoGeral.shift();
        }
    }

    return mensagem;
}

// Conexão de usuários
io.on('connection', socket => {

    console.log('Usuário conectado:', socket.id);

    // REGISTRAR USUÁRIO
    socket.on('register', dados => {

        if (!dados || typeof dados.nome !== 'string') {
            return;
        }

        const nome = dados.nome.trim().slice(0, 30);

        if (!nome) {
            socket.emit('register error', 'Digite um nome válido.');
            return;
        }

        if (!validarImagem(dados.foto)) {
            socket.emit('register error', 'Foto de perfil inválida.');
            return;
        }

        usuarios.set(socket.id, {
            nome: nome,
            foto: dados.foto || ''
        });

        socket.emit('registered', {
            id: socket.id,
            nome: nome
        });

        atualizarUsuarios();

        console.log(nome + ' entrou no chat.');
    });

    // HISTÓRICO DO CHAT GERAL
    socket.on('get general history', () => {

        if (!usuarios.has(socket.id)) return;

        socket.emit('chat history', historicoGeral);
    });

    // ENVIAR MENSAGEM NO CHAT GERAL
    socket.on('chat message', dados => {

        const usuario = usuarios.get(socket.id);

        if (!usuario || !dados) return;

        if (!validarImagem(dados.imagem)) return;

        const texto = typeof dados.texto === 'string'
            ? dados.texto.slice(0, 3000)
            : '';

        if (!texto && !dados.imagem) return;

        const mensagem = salvarMensagem({
            de: socket.id,
            nome: usuario.nome,
            foto: usuario.foto,
            texto: texto,
            imagem: dados.imagem
        });

        io.emit('chat message', mensagem);
    });

    // SOLICITAR HISTÓRICO PRIVADO
    socket.on('get private history', contatoId => {

        if (!usuarios.has(socket.id)) return;
        if (!usuarios.has(contatoId)) return;

        const chave = chaveConversa(socket.id, contatoId);

        const historico = conversasPrivadas.get(chave) || [];

        socket.emit('private history', {
            contatoId: contatoId,
            mensagens: historico
        });
    });

    // ENVIAR MENSAGEM PRIVADA
    socket.on('private message', dados => {

        const usuario = usuarios.get(socket.id);

        if (!usuario || !dados) return;
        if (!usuarios.has(dados.para)) return;
        if (dados.para === socket.id) return;

        if (!validarImagem(dados.imagem)) return;

        const texto = typeof dados.texto === 'string'
            ? dados.texto.slice(0, 3000)
            : '';

        if (!texto && !dados.imagem) return;

        const mensagem = salvarMensagem({
            de: socket.id,
            para: dados.para,
            nome: usuario.nome,
            foto: usuario.foto,
            texto: texto,
            imagem: dados.imagem
        }, true);

        // Enviar para quem mandou e quem recebeu
        io.to(socket.id)
            .to(dados.para)
            .emit('private message', mensagem);
    });

    // INDICADOR DE DIGITAÇÃO
    socket.on('typing', dados => {

        const usuario = usuarios.get(socket.id);

        if (!usuario || !dados) return;

        if (dados.para === 'geral') {

            socket.broadcast.emit('typing', {
                id: socket.id,
                nome: usuario.nome,
                para: 'geral',
                digitando: Boolean(dados.digitando)
            });

        } else {

            const destinatario = dados.para;

            if (!usuarios.has(destinatario)) return;

            io.to(destinatario).emit('typing', {
                id: socket.id,
                nome: usuario.nome,
                para: socket.id,
                digitando: Boolean(dados.digitando)
            });
        }
    });

    // QUANDO O USUÁRIO DESCONECTAR
    socket.on('disconnect', () => {

        const usuario = usuarios.get(socket.id);

        if (usuario) {
            console.log(usuario.nome + ' saiu do chat.');

            usuarios.delete(socket.id);

            atualizarUsuarios();
        }
    });

});

// INICIAR SERVIDOR
const PORTA = 3000;

servidor.listen(PORTA, () => {
    console.log('================================');
    console.log('       CHAT XYZ INICIADO');
    console.log('================================');
    console.log('Acesse: http://localhost:' + PORTA);
});
