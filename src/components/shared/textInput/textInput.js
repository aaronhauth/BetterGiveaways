import React from 'react'
import './textInput.scss';

export class TextInputComponent extends React.Component {

    render() {
        let styles = 'input';
        if (this.props.theme === 'light') {
            styles += ' light';
        } else {
            styles += ' dark';
        }

        return <input className={styles} onChange={this.props.onChange} placeholder={this.props.placeholder} type="text"></input>
    }
}