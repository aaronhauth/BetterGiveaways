import React from 'react'
import './button.scss';


export class ButtonComponent extends React.Component {

    handleButtonClick() {
        if (!this.props.disabled && !!this.props.onClick) {
            this.props.onClick();
        }
    }

    render() {
        let buttonClasses = 'button';
        if (this.props.disabled) {
            buttonClasses += ' disabled';
        }
        if (this.props.animateIn) {
            buttonClasses += ' animateIn'
        }

        return <div className={buttonClasses} onClick={() => this.handleButtonClick()}>{this.props.children}</div>
    }
}