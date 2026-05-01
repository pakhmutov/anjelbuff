module.exports = {
    apps: [
        {
            name: 'uk-service',
            script: 'src/index.ts',
            interpreter: '/root/anjelbuff/node_modules/.bin/tsx',
            cwd: '/root/anjelbuff/packages/uk-service',
            restart_delay: 5000,
            max_restarts: 10,
        },
    ],
};
