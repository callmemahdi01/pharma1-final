(function() {
    'use strict';
    
    const createStyleElement = (content) => {
        const style = document.createElement('style');
        style.textContent = content;
        document.head.appendChild(style);
        return style;
    };

    createStyleElement(`
        html, body {
            overflow-x: hidden;
            overflow-y: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
            margin: 0;
            padding: 0;
        }
        
        ::-webkit-scrollbar {
            display: none;
        }
        
        #scroll-progress-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            height: 3px;
            background: linear-gradient(90deg, #4caf50, #45a049);
            width: 0%;
            z-index: 9999;
            transition: width 0.2s ease-out, background-color 0.3s ease;
            box-shadow: 0 0 8px rgba(76, 175, 80, 0.4);
            cursor: pointer;
        }
        
        #scroll-percent {
            position: fixed;
            bottom: 5px;
            left: 0;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-weight: 500;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0;
            transform: translateY(10px);
            pointer-events: none;
            backdrop-filter: blur(4px);
        }
        
        #scroll-percent.visible {
            opacity: 1;
            transform: translateY(0);
        }
    `);

    const progressBar = document.createElement('div');
    progressBar.id = 'scroll-progress-bar';
    
    const percentText = document.createElement('div');
    percentText.id = 'scroll-percent';
    percentText.textContent = '0%';
    
    document.body.append(progressBar, percentText);

    const getScrollMetrics = () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
        const scrollHeight = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
        );
        const clientHeight = window.innerHeight;
        return { scrollTop, scrollHeight, clientHeight };
    };

    const getColorByPercent = (percent) => {
        if (percent > 80) return '#e53e3e';
        if (percent > 50) return '#ff9800';
        return '#4caf50';
    };

    let hideTimeout;
    let isScrolling = false;

    const updateScrollProgress = () => {
        const { scrollTop, scrollHeight, clientHeight } = getScrollMetrics();
        const docHeight = scrollHeight - clientHeight;
        
        if (docHeight <= 0) return;

        const scrollPercent = Math.round(Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)));
        
        progressBar.style.width = `${scrollPercent}%`;
        progressBar.style.backgroundColor = getColorByPercent(scrollPercent);
        
        const barWidth = window.innerWidth;
        const percentPosition = Math.max(10, Math.min(barWidth - 50, (scrollPercent / 100) * barWidth - 20));
        
        percentText.textContent = `${scrollPercent}%`;
        percentText.style.left = `${percentPosition}px`;
        
        if (!isScrolling) {
            percentText.classList.add('visible');
            isScrolling = true;
        }
        
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            percentText.classList.remove('visible');
            isScrolling = false;
        }, 1500);
    };

    const handleProgressBarClick = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const clickPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const { scrollHeight, clientHeight } = getScrollMetrics();
        const targetScroll = (clickPercent / 100) * (scrollHeight - clientHeight);
        
        window.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
        });
    };

    const throttle = (func, limit) => {
        let inThrottle;
        return function() {
            if (!inThrottle) {
                func.apply(this, arguments);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    };

    const throttledUpdate = throttle(updateScrollProgress, 16);

    window.addEventListener('scroll', throttledUpdate, { passive: true });
    window.addEventListener('resize', throttledUpdate, { passive: true });
    progressBar.addEventListener('click', handleProgressBarClick);

    const init = () => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', updateScrollProgress);
        } else {
            updateScrollProgress();
        }
    };

    init();

    window.removeCustomScrollbar = () => {
        progressBar?.remove();
        percentText?.remove();
        
        createStyleElement(`
            html, body {
                scrollbar-width: auto !important;
                -ms-overflow-style: auto !important;
            }
            ::-webkit-scrollbar {
                display: block !important;
            }
        `);
    };

})();